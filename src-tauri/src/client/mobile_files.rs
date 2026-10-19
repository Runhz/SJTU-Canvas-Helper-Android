use super::Client;
use crate::model::File;
use serde_json::Value;
use std::path::Path;
use tokio::io::AsyncWriteExt;
use md5::{Digest,Md5};
type Result<T>=std::result::Result<T,String>;
// A cancelled caller must not let another expensive parser run beside its
// still-running blocking task. The task itself retains this permit.
static TEXT_PARSERS:tokio::sync::Semaphore=tokio::sync::Semaphore::const_new(1);
impl Client{
    pub async fn mobile_file_text(&self,id:i64,token:&str,root:&Path,max_mb:u64,on_phase:&mut(dyn FnMut(String)+Send))->Result<(String,String)>{
        if id<=0{return Err("文件标识无效".into())}
        on_phase("正在检查课件版本…".into());
        let raw:Value=tokio::time::timeout(std::time::Duration::from_secs(20),self.get_json_with_token(&format!("https://oc.sjtu.edu.cn/api/v1/files/{id}"),None::<&str>,token)).await.map_err(|_|"读取课件信息超时，请重试")?.map_err(|_|"课件信息读取失败，请刷新课程资料或检查访问权限")?;
        let file:File=serde_json::from_value(raw.clone()).map_err(|_|"课件信息格式不完整")?;
        let max_bytes=max_mb.clamp(16,256)*1024*1024;
        if file.size>max_bytes{return Err(format!("课件为 {:.1} MB，超过本机安全读取容量 {} MB；请按章节拆分",file.size as f64/1048576.0,max_mb.clamp(16,256)))}
        let revision=format!("{id}:{}:{}:{}:reader-v3",file.uuid,file.size,raw["updated_at"]);
        let key=format!("{:x}",Md5::digest(revision.as_bytes()));tokio::fs::create_dir_all(root).await.map_err(|_|"无法建立课件缓存")?;
        let text_path=root.join(format!("{key}.txt"));
        if let Ok(text)=tokio::fs::read_to_string(&text_path).await{on_phase("已读取此版本的本机课件缓存".into());return Ok((file.display_name,text))}
        let binary=root.join(format!("{key}.source"));
        if !binary.is_file(){
            let url=reqwest::Url::parse(&file.url).map_err(|_|"课件地址无效")?;if url.scheme()!="https"{return Err("课件地址需要 HTTPS".into())}
            let mut request=self.cli.get(url.clone()).timeout(std::time::Duration::from_secs(300));if url.origin().ascii_serialization()=="https://oc.sjtu.edu.cn"{request=request.bearer_auth(token)}
            let mut response=request.send().await.map_err(|_|"课件下载连接失败")?.error_for_status().map_err(|_|"课件下载鉴权失败，请刷新资料列表")?;
            if response.url().scheme()!="https"{return Err("课件跳转地址无效".into())}
            if response.content_length().is_some_and(|n|n>max_bytes){return Err("课件超过本机读取容量，请按章节拆分".into())}
            let tmp=root.join(format!("{key}.partial"));let mut output=tokio::fs::File::create(&tmp).await.map_err(|_|"无法暂存课件")?;let(mut done,mut last)=(0u64,0u64);
            on_phase(format!("正在下载课件 · {:.1} MB",file.size as f64/1048576.0));
            while let Some(bytes)=response.chunk().await.map_err(|_|"课件下载中断，请重试")?{done+=bytes.len() as u64;if done>max_bytes{drop(output);let _=tokio::fs::remove_file(&tmp).await;return Err("课件超过本机读取容量，请按章节拆分".into())}output.write_all(&bytes).await.map_err(|_|"空间不足，无法暂存课件")?;if done/1048576!=last{last=done/1048576;on_phase(format!("正在下载课件 · 已读取 {:.1} MB",done as f64/1048576.0));}}
            output.flush().await.map_err(|_|"课件缓存写入失败")?;drop(output);if file.size>0&&done!=file.size{let _=tokio::fs::remove_file(&tmp).await;return Err("课件长度不完整，请重新下载".into())}tokio::fs::rename(tmp,&binary).await.map_err(|_|"课件缓存保存失败")?;
        }
        on_phase("正在提取课件正文、幻灯片与备注…".into());
        let text=parse_local_text(binary.clone(),file.display_name.clone()).await?;
        let tmp=root.join(format!("{key}.text.partial"));tokio::fs::write(&tmp,&text).await.map_err(|_|"课件文字缓存保存失败")?;tokio::fs::rename(tmp,text_path).await.map_err(|_|"课件文字缓存保存失败")?;
        Ok((file.display_name,text))
    }
}

/// Shared parser for trusted staged downloads and direct Canvas retrieval.
pub async fn parse_local_text(path:std::path::PathBuf,name:String)->Result<String>{
    let permit=TEXT_PARSERS.acquire().await.map_err(|_|"课件读取队列已关闭")?;
    tokio::task::spawn_blocking(move||{
        let _permit=permit;
        let size=std::fs::metadata(&path).map_err(|_|"文件缓存已失效")?.len();
        if size==0||size>256*1024*1024{return Err("文件为空或超过 256 MB，请按章节拆分".into())}
        let bytes=std::fs::read(path).map_err(|_|"文件缓存读取失败")?;
        let ext=Path::new(&name).extension().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();
        let reader=super::file_parser::new_generic_file_reader();
        let parsed=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||tokio::runtime::Handle::current().block_on(reader.parse(bytes.into(),&ext))));
        let text=parsed.map_err(|_|"文件解析失败，可能已加密或损坏")?.map_err(|e|match e{crate::error::AppError::LLMError(s)=>s,crate::error::AppError::UnsupportedFileExtensionError(_)=>format!("暂不支持 .{ext} 的内容读取；可使用 PDF、PPT/PPTX、DOCX、XLSX 或文本"),_=>"文件已加密、损坏或文字层无法解析".into()})?;
        let useful=text.lines().any(|line|!line.trim().is_empty()&&!line.starts_with("[PDF 第 "));
        if !useful{return Err("[NO_TEXT] 文件没有可提取文字，需使用页面图像阅读".into())}
        if text.chars().count()>2_000_000{return Err("文件正文过多，请按章节拆分后提问".into())}
        Ok(text)
    }).await.map_err(|_|"文件读取任务未完成".to_string())?
}
