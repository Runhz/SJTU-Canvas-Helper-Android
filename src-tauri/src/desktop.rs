//! Windows workspace services. No Android UI or native plugin is involved.
use std::{collections::HashMap, path::PathBuf, time::Duration};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use crate::{mobile::{MobileState, MAIN_CAMPUS}, model::File};

type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub struct DesktopRuntime { port:tokio::sync::Mutex<Option<u16>> }

/// This entry point starts only the Windows workspace and its services. It does
/// not initialize the upstream account database, updater, or MCP server.
#[cfg(feature="windows-workspace")]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(MobileState::default())
        .manage(DesktopRuntime::default())
        .invoke_handler(tauri::generate_handler![
            desktop_load_settings, desktop_save_settings, desktop_open_portal,
            desktop_sync_login, desktop_login_status, desktop_open_preview, desktop_import_files,
            desktop_download_file, desktop_downloads, desktop_download_action, desktop_prepare_player, desktop_export_note,
            crate::mobile::configure_session, crate::mobile::restore_session,
            crate::mobile::clear_session, crate::mobile::canvas_request,
            crate::mobile::submit_work, crate::mobile::ai_chat, crate::mobile::cancel_ai,
            crate::mobile::read_course_file, crate::mobile::read_prepared_file,
            crate::mobile::list_models, crate::mobile::model_capabilities,
            crate::mobile::test_model
        ])
        .run(tauri::generate_context!())
        .expect("Windows workspace could not start");
}

#[tauri::command]
pub async fn desktop_export_note(path:String,content:String)->Result<()> {
    if content.len()>10_000_000{return Err("笔记过大，请分篇导出".into());}
    tokio::fs::write(path,content.as_bytes()).await.map_err(|_|"笔记导出失败，请检查保存位置".into())
}

/// A local, ephemeral media proxy supplies the platform-required Referer and
/// handles Range requests. The host list is fixed; callers cannot proxy URLs.
#[tauri::command]
pub async fn desktop_prepare_player(state:State<'_,DesktopRuntime>)->Result<u16> {
    use warp::Filter;
    let mut port=state.port.lock().await;
    if let Some(value)=*port{return Ok(value);}
    let client=reqwest::Client::builder().timeout(Duration::from_secs(180)).build().map_err(|_|"播放连接未能建立")?;
    let routes=warp::get().and(warp::path::param::<String>()).and(warp::path::tail())
        .and(warp::query::raw().or(warp::any().map(String::new)).unify())
        .and(warp::header::optional::<String>("range"))
        .and_then(move |kind:String,tail:warp::path::Tail,query:String,range:Option<String>|{
            let client=client.clone();async move {
                let target=match kind.as_str(){
                    "canvas-vod"=>Some(("https://videos.sjtu.edu.cn/vod","https://v.sjtu.edu.cn/")),
                    "legacy-vod"=>Some(("https://videos.sjtu.edu.cn/vod","https://courses.sjtu.edu.cn/")),
                    "vod"=>Some(("https://live.sjtu.edu.cn/vod","https://courses.sjtu.edu.cn/")),
                    "canvas-live"=>Some(("https://live.sjtu.edu.cn","https://v.sjtu.edu.cn/")),_=>None
                };
                let mut builder=warp::http::Response::builder();
                let body=if let Some((base,referer))=target {
                    let url=format!("{base}/{}{}{}",tail.as_str(),if query.is_empty(){""}else{"?"},query);
                    let mut req=client.get(url).header("Referer",referer).header("Accept-Encoding","identity");
                    if let Some(range)=range{req=req.header("Range",range);}
                    match req.send().await {
                        Ok(response)=>{
                            use futures::StreamExt;
                            builder=builder.status(response.status().as_u16());
                            for name in ["content-type","content-length","content-range","accept-ranges","etag","last-modified"]{
                                if let Some(value)=response.headers().get(name){builder=builder.header(name,value.as_bytes());}
                            }
                            warp::hyper::Body::wrap_stream(response.bytes_stream().map(|chunk|chunk.map_err(std::io::Error::other)))
                        },
                        Err(_)=>{builder=builder.status(502);warp::hyper::Body::from("Media connection failed")}
                    }
                }else{builder=builder.status(404);warp::hyper::Body::empty()};
                Ok::<_,std::convert::Infallible>(builder.body(body).unwrap())
            }
        }).with(warp::cors().allow_any_origin().allow_methods(["GET"]).allow_headers(["range"]).expose_headers(["content-length","content-range","accept-ranges"]));
    let(address,server)=warp::serve(routes).try_bind_ephemeral(([127,0,0,1],0)).map_err(|_|"本机播放端口无法建立")?;
    tokio::spawn(server);*port=Some(address.port());Ok(address.port())
}

#[path="desktop_credentials.rs"]
mod credentials;
use credentials::protect;

fn config_path(app:&AppHandle)->Result<PathBuf> {
    Ok(app.path().app_config_dir().map_err(|_|"配置目录不可用")?.join("windows-credentials.dat"))
}
#[tauri::command]
pub async fn desktop_load_settings(app:AppHandle)->Result<Value> {
    let path=config_path(&app)?;
    match tokio::fs::read(&path).await {
        Ok(bytes)=>serde_json::from_slice(&protect(&bytes,true)?).map_err(|_|"本机配置损坏，请重新连接".into()),
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(json!({"currentId":"","accounts":[]})),
        Err(_)=>Err("无法读取本机账号配置".into())
    }
}
#[tauri::command]
pub async fn desktop_save_settings(app:AppHandle, settings:Value)->Result<()> {
    let path=config_path(&app)?;
    tokio::fs::create_dir_all(path.parent().unwrap()).await.map_err(|_|"无法建立配置目录")?;
    let bytes=protect(&serde_json::to_vec(&settings).map_err(|_|"配置无效")?,false)?;
    let temp=path.with_extension("tmp");
    tokio::fs::write(&temp,bytes).await.map_err(|_|"保存配置失败")?;
    tokio::fs::rename(temp,path).await.map_err(|_|"保存配置失败".to_string())
}

fn open_window(app:&AppHandle,label:&str,title:&str,url:tauri::Url)->Result<()> {
    if let Some(window)=app.get_webview_window(label) {
        window.navigate(url).map_err(|_|"页面加载失败")?;
        window.unminimize().ok(); window.show().ok(); window.set_focus().map_err(|_|"无法打开窗口")?;
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(app,label,tauri::WebviewUrl::External(url))
        .title(title).inner_size(1280.,820.).min_inner_size(760.,520.).center()
        .build().map_err(|_|"无法建立观看窗口")?; Ok(())
}
#[tauri::command]
pub async fn desktop_open_portal(app:AppHandle,kind:String,course_id:Option<i64>,assignment_id:Option<i64>)->Result<()> {
    let url=match kind.as_str() {
        "login"=>format!("{MAIN_CAMPUS}/login/saml"),
        // /vod is a media path, not a live-program directory. Use the teaching portal.
        "live"=>"https://v.sjtu.edu.cn/".into(),
        "assignment"=>format!("{MAIN_CAMPUS}/courses/{}/assignments/{}",course_id.filter(|v|*v>0).ok_or("课程无效")?,assignment_id.filter(|v|*v>0).ok_or("作业无效")?),
        "course"=>format!("{MAIN_CAMPUS}/courses/{}",course_id.filter(|v|*v>0).ok_or("课程无效")?),
        "token"=>format!("{MAIN_CAMPUS}/profile/settings"),
        _=>return Err("未知页面".into())
    };
    let label=if kind=="login"{"windows-login"}else if kind=="live"{"windows-live"}else{"windows-platform"};
    open_window(&app,label,if kind=="live"{"Canvas 课堂 · 直播与录播"}else{"Canvas 官方平台"},url.parse().map_err(|_|"页面地址无效")?)
}
#[tauri::command]
pub async fn desktop_sync_login(app:AppHandle,state:State<'_,MobileState>)->Result<Value> {
    // Start with the protected session copy. WebView cookies are scoped by
    // host/path, so a fresh window may not expose every host on the first
    // read. Merging both sources prevents a valid login from being reported
    // as expired just because the login window was reopened.
    let window=app.get_webview_window("windows-login").or_else(||app.get_webview_window("main"));
    let mut cookies={let guard=state.session.read().await;guard.as_ref().ok_or("请先连接 Canvas Token")?.config.web_cookies.clone()};
    let has_window=window.is_some();
    if let Some(window)=window {
        for origin in [MAIN_CAMPUS,"https://jaccount.sjtu.edu.cn/","https://v.sjtu.edu.cn/","https://courses.sjtu.edu.cn/"] {
            // A WebView can briefly reject one host while its redirect is
            // settling. Keep the cookies already collected from other hosts
            // instead of turning that transient miss into a false logout.
            if let Ok(list)=window.cookies_for_url(origin.parse().unwrap()) {
                let header=list.iter().map(|c|format!("{}={}",c.name(),c.value())).collect::<Vec<_>>().join("; ");
                if !header.is_empty(){cookies.insert(origin.to_string(),header);}
            }
        }
    }
    let guard=state.session.read().await; let session=guard.as_ref().ok_or("请先连接 Canvas Token")?;
    for (origin,header) in &cookies { session.client.mobile_restore_web_cookies(origin,header); }
    let cookie=cookies.get("https://jaccount.sjtu.edu.cn/").cloned().unwrap_or_default();
    if cookies.is_empty(){return Err("尚未找到网页登录状态，请先在官方窗口完成登录".into());}
    if !cookie.is_empty(){session.client.mobile_set_cookies(&cookie);}
    // Validate actual Canvas access rather than confusing an expired optional service with a logout.
    tokio::time::timeout(Duration::from_secs(20),session.client.get_me(&session.config.token)).await
        .map_err(|_|"验证连接超时，可稍后重试")?.map_err(|_|"Canvas 连接验证未通过")?;
    Ok(json!({"cookie":cookie,"webCookies":cookies,"synced":true,"source":if has_window{"window+saved"}else{"saved"}}))
}

/// Return a cheap, non-network login status for the settings screen. The
/// official portal may use several hosts, so presence of any protected web
/// cookie is enough to show "已同步"; the actual Canvas token remains the
/// authoritative API connection check.
#[tauri::command]
pub async fn desktop_login_status(state:State<'_,MobileState>)->Result<Value> {
    let guard=state.session.read().await;
    let session=guard.as_ref().ok_or("请先连接 Canvas Token")?;
    let sources=session.config.web_cookies.iter().filter(|(_,value)|!value.trim().is_empty()).map(|(key,_)|key.clone()).collect::<Vec<_>>();
    Ok(json!({"loggedIn":!sources.is_empty(),"sources":sources,"hasCanvasToken":!session.config.token.trim().is_empty()}))
}
#[tauri::command]
pub async fn desktop_open_preview(app:AppHandle,state:State<'_,MobileState>,file_id:i64,title:String)->Result<()> {
    if file_id<=0{return Err("文件标识无效".into());}
    let client_and_token={let guard=state.session.read().await;let s=guard.as_ref().ok_or("请先连接账号")?;(s.client.clone(),s.config.token.clone())};
    let url=tokio::time::timeout(Duration::from_secs(30),client_and_token.0.get_file_preview_session_url(file_id,&client_and_token.1)).await
        .map_err(|_|"平台预览连接超时，请重试")?.map_err(|_|"平台未提供预览，请下载后使用本机阅读器")?;
    let url:tauri::Url=url.parse().map_err(|_|"预览地址无效")?;
    if url.scheme()!="https" {return Err("预览需要安全连接".into());}
    open_window(&app,&format!("windows-file-{file_id}"),&title,url)
}
#[tauri::command]
pub async fn desktop_import_files(app:AppHandle,state:State<'_,MobileState>,paths:Vec<String>,for_ai:bool)->Result<Value> {
    use md5::{Digest,Md5};
    if paths.len()>12{return Err("每次最多选择 12 个附件".into());}
    let (root,limit)={let guard=state.session.read().await;let s=guard.as_ref().ok_or("请先连接账号")?;
        let root=if for_ai {app.path().app_cache_dir().map_err(|_|"缓存目录不可用")?.join("ai-imports").join(format!("{:x}",Md5::digest(format!("{}:{}",s.config.account_id,s.config.token).as_bytes())))}else{s.cache_root.clone()};
        (root,s.config.ai_file_max_mb.clamp(16,256)*1024*1024)};
    tokio::fs::create_dir_all(&root).await.map_err(|_|"无法建立附件目录")?;
    let mut result=Vec::new();
    for path in paths {
        let source=tokio::fs::canonicalize(&path).await.map_err(|_|"附件不存在")?;
        let info=tokio::fs::metadata(&source).await.map_err(|_|"附件不可读")?;
        if !info.is_file()||info.len()==0||info.len()>limit{return Err("附件为空或超过本机读取容量".into());}
        let name=source.file_name().and_then(|s|s.to_str()).ok_or("附件名称无效")?.to_string();
        let target=root.join(format!("{}-{}",uuid::Uuid::new_v4(),name));
        tokio::fs::copy(source,&target).await.map_err(|_|"导入附件失败，请检查磁盘空间")?;
        result.push(json!({"name":name,"path":target,"size":info.len()}));
    }
    Ok(json!({"files":result}))
}
#[tauri::command]
pub async fn desktop_download_file(app:AppHandle,state:State<'_,MobileState>,file_id:i64,path:String)->Result<()> {
    if file_id<=0{return Err("文件标识无效".into());}
    let(client,token,config)={let guard=state.session.read().await;let s=guard.as_ref().ok_or("请先连接账号")?;(s.client.clone(),s.config.token.clone(),s.config.clone())};
    let file:File=client.get_json_with_token(&format!("{MAIN_CAMPUS}/api/v1/files/{file_id}"),None::<&str>,&token).await.map_err(|_|"无法读取文件信息")?;
    client.desktop_save_download(&file,&token,PathBuf::from(&path)).await?;
    let _lock=DOWNLOADS_LOCK.lock().await;
    let ledger=downloads_path(&app,&config)?;
    let mut items=read_downloads(&ledger).await?;
    let metadata=tokio::fs::metadata(&path).await.map_err(|_|"文件已下载，但下载记录未完成")?;
    items.retain(|item|item["path"].as_str()!=Some(path.as_str()));
    items.push(json!({"id":uuid::Uuid::new_v4().to_string(),"fileId":file_id,"name":file.display_name,"path":path,"size":metadata.len(),"modified":modified_stamp(&metadata),"savedAt":chrono::Utc::now().to_rfc3339()}));
    write_downloads(&ledger,&items).await.map_err(|_|"文件已保存到所选位置，但下载记录未能保存".to_string())
}

static DOWNLOADS_LOCK:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
fn modified_stamp(metadata:&std::fs::Metadata)->String{metadata.modified().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d|d.as_nanos().to_string()).unwrap_or_default()}
fn downloads_path(app:&AppHandle,config:&crate::mobile::SessionConfig)->Result<PathBuf>{
    use md5::{Digest,Md5};
    let key=format!("{:x}",Md5::digest(format!("{}:{}",config.account_id,config.token).as_bytes()));
    Ok(app.path().app_data_dir().map_err(|_|"下载目录不可用")?.join(format!("downloads-{key}.json")))
}
async fn read_downloads(path:&std::path::Path)->Result<Vec<Value>>{
    match tokio::fs::read(path).await {
        Ok(bytes)=>serde_json::from_slice(&bytes).map_err(|_|"下载记录损坏，文件仍在原保存位置".into()),
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(vec![]),
        Err(_)=>Err("下载记录无法读取".into())
    }
}
async fn write_downloads(path:&std::path::Path,items:&Vec<Value>)->Result<()>{
    tokio::fs::create_dir_all(path.parent().unwrap()).await.map_err(|_|"下载目录无法建立")?;
    let tmp=path.with_extension("tmp");
    tokio::fs::write(&tmp,serde_json::to_vec(items).map_err(|_|"下载记录无效")?).await.map_err(|_|"下载记录保存失败")?;
    tokio::fs::rename(tmp,path).await.map_err(|_|"下载记录保存失败".into())
}
#[tauri::command]
pub async fn desktop_downloads(app:AppHandle,state:State<'_,MobileState>)->Result<Vec<Value>>{
    let config=state.session.read().await.as_ref().ok_or("请先连接账号")?.config.clone();
    let _lock=DOWNLOADS_LOCK.lock().await;let mut items=read_downloads(&downloads_path(&app,&config)?).await?;
    for item in &mut items {item["exists"]=json!(item["path"].as_str().is_some_and(|p|std::path::Path::new(p).is_file()));}
    items.reverse();Ok(items)
}
#[tauri::command]
pub async fn desktop_download_action(app:AppHandle,state:State<'_,MobileState>,id:String,action:String)->Result<()> {
    use tauri_plugin_shell::ShellExt;
    let config=state.session.read().await.as_ref().ok_or("请先连接账号")?.config.clone();
    let _lock=DOWNLOADS_LOCK.lock().await;let ledger=downloads_path(&app,&config)?;let mut items=read_downloads(&ledger).await?;
    let item=items.iter().find(|v|v["id"]==id).ok_or("下载记录已不存在")?;
    let path=PathBuf::from(item["path"].as_str().ok_or("下载路径无效")?);
    match action.as_str(){
        "open"=>app.shell().open(path.to_string_lossy().into_owned(),None).map_err(|_|"系统未能打开文件，请检查默认阅读器")?,
        "delete"=>{
            if let Ok(metadata)=tokio::fs::metadata(&path).await {
                if metadata.len()!=item["size"].as_u64().unwrap_or(0)||modified_stamp(&metadata)!=item["modified"].as_str().unwrap_or("") {return Err("这个文件已在应用外被修改，请在资源管理器中处理，原文件没有删除".into());}
                tokio::fs::remove_file(&path).await.map_err(|_|"文件正在使用或无法删除")?;
            }
            items.retain(|v|v["id"]!=id);write_downloads(&ledger,&items).await?;
        },
        _=>return Err("未知下载操作".into())
    }Ok(())
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn chinese_credentials_roundtrip() {
        let text=r#"{"currentId":"中文账号","note":"数学 α → 50%"}"#;
        let encrypted=protect(text.as_bytes(),false).unwrap();
        #[cfg(windows)] assert_ne!(encrypted,text.as_bytes());
        let decoded=String::from_utf8(protect(&encrypted,true).unwrap()).unwrap();
        assert_eq!(decoded,text); assert!(!decoded.contains('\u{fffd}'));
        assert_eq!(serde_json::from_str::<Value>(&decoded).unwrap()["currentId"],"中文账号");
    }
}
