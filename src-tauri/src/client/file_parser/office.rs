//! Text-only Office reading. No Office installation, external process or PDF conversion.
use std::{collections::{HashMap,HashSet},io::{Cursor,Read}};
use quick_xml::{Reader,events::Event};
const XML_LIMIT:u64=32*1024*1024;
const TEXT_LIMIT:usize=16*1024*1024;
type Result<T>=std::result::Result<T,String>;
fn read_zip(zip:&mut zip::ZipArchive<Cursor<&[u8]>>,name:&str)->Result<String>{
    let mut f=zip.by_name(name).map_err(|_|format!("课件缺少必要内容：{name}"))?;
    if f.size()>XML_LIMIT{return Err("单个课件内容块过大，请拆分课件后读取".into())}
    let mut s=String::new();f.by_ref().take(XML_LIMIT+1).read_to_string(&mut s).map_err(|_|"课件 XML 无法读取")?;
    if s.len()>XML_LIMIT as usize{return Err("课件解压内容过大".into())}Ok(s)
}
fn local(name:&[u8])->&[u8]{name.rsplit(|v|*v==b':').next().unwrap_or(name)}
pub fn xml_text(xml:&str)->Result<String>{
    let mut reader=Reader::from_str(xml);let mut result=String::new();
    loop{match reader.read_event().map_err(|_|"课件 XML 结构损坏")?{
        Event::Text(t)=>result.push_str(&t.unescape().map_err(|_|"课件文字转义损坏")?),
        Event::CData(t)=>result.push_str(&String::from_utf8_lossy(&t)),
        Event::End(e) if [b"p".as_slice(),b"row",b"tr",b"si"].contains(&local(e.name().as_ref()))=>result.push('\n'),
        Event::Empty(e) if [b"br".as_slice(),b"tab"].contains(&local(e.name().as_ref()))=>result.push(' '),
        Event::Eof=>break,_=>{}
    }if result.len()>TEXT_LIMIT{return Err("课件解出的文字过多，请按章节拆分".into())}}
    Ok(result.trim().to_string())
}
fn relations(xml:&str)->Result<HashMap<String,(String,String)>>{
    let mut r=Reader::from_str(xml);let mut values=HashMap::new();
    loop{match r.read_event().map_err(|_|"课件关系表损坏")?{Event::Empty(e)|Event::Start(e) if local(e.name().as_ref())==b"Relationship"=>{
        let(mut id,mut target,mut kind,mut external)=(String::new(),String::new(),String::new(),false);
        for a in e.attributes(){let a=a.map_err(|_|"课件关系表损坏")?;let value=a.decode_and_unescape_value(r.decoder()).map_err(|_|"课件关系表编码损坏")?.into_owned();match a.key.as_ref(){b"Id"=>id=value,b"Target"=>target=value,b"Type"=>kind=value,b"TargetMode"=>external=value=="External",_=>{}}}
        if !external{values.insert(id,(target,kind));}
    },Event::Eof=>break,_=>{}}}Ok(values)
}
fn archive_path(base:&str,target:&str)->Result<String>{
    let mut parts:Vec<&str>=if target.starts_with('/') {vec![]}else{base.rsplit_once('/').map(|(p,_)|p.split('/').collect()).unwrap_or_default()};
    for part in target.trim_start_matches('/').split('/') {match part{".."=>{if parts.pop().is_none(){return Err("课件关系路径无效".into())}},"."|""=>{},p=>parts.push(p)}}Ok(parts.join("/"))
}
fn presentation(zip:&mut zip::ZipArchive<Cursor<&[u8]>>)->Result<String>{
    let main=read_zip(zip,"ppt/presentation.xml")?;
    let rels=relations(&read_zip(zip,"ppt/_rels/presentation.xml.rels")?)?;
    let mut reader=Reader::from_str(&main);let mut order=Vec::new();
    loop{match reader.read_event().map_err(|_|"课件目录损坏")?{Event::Empty(e)|Event::Start(e) if local(e.name().as_ref())==b"sldId"=>{
        for a in e.attributes(){let a=a.map_err(|_|"课件页码损坏")?;if a.key.as_ref()==b"r:id"{order.push(a.decode_and_unescape_value(reader.decoder()).map_err(|_|"课件页码损坏")?.into_owned())}}
    },Event::Eof=>break,_=>{}}}
    let mut result=String::new();
    for (i,id) in order.iter().enumerate(){
        let target=&rels.get(id).ok_or("课件页面关联缺失")?.0;let path=archive_path("ppt/presentation.xml",target)?;
        result.push_str(&format!("\n\n[幻灯片 {}]\n{}",i+1,xml_text(&read_zip(zip,&path)?)?));
        let (dir,name)=path.rsplit_once('/').ok_or("课件页面路径无效")?;let rel_path=format!("{dir}/_rels/{name}.rels");
        if let Ok(xml)=read_zip(zip,&rel_path){for(_, (target,kind))in relations(&xml)?{if kind.ends_with("/notesSlide"){let notes=archive_path(&path,&target)?;let text=xml_text(&read_zip(zip,&notes)?)?;if !text.trim().is_empty(){result.push_str(&format!("\n[本页备注]\n{text}"));}}}}
        if result.len()>TEXT_LIMIT{return Err("课件文字过多，请拆分课件后读取".into())}
    }
    if order.is_empty(){return Err("课件没有可读取的幻灯片".into())}Ok(result)
}
fn spreadsheets(zip:&mut zip::ZipArchive<Cursor<&[u8]>>)->Result<String>{
    let mut shared=Vec::new();
    if let Ok(xml)=read_zip(zip,"xl/sharedStrings.xml"){
        let mut r=Reader::from_str(&xml);let(mut text,mut inside)=(String::new(),false);
        loop{match r.read_event().map_err(|_|"表格文字损坏")?{Event::Start(e)if local(e.name().as_ref())==b"si"=>{inside=true;text.clear()},Event::Text(e)if inside=>text.push_str(&e.unescape().map_err(|_|"表格文字损坏")?),Event::End(e)if local(e.name().as_ref())==b"si"=>{shared.push(text.clone());inside=false},Event::Eof=>break,_=>{}}}
    }
    let mut names:Vec<_>=zip.file_names().filter(|p|p.starts_with("xl/worksheets/")&&p.ends_with(".xml")&&!p.contains("/_rels/")).map(str::to_owned).collect();names.sort();
    let mut output=String::new();
    for name in names{output.push_str(&format!("\n[工作表 {name}]\n"));let xml=read_zip(zip,&name)?;let mut r=Reader::from_str(&xml);let(mut value,mut kind,mut cell)=(String::new(),String::new(),String::new());let mut inside=false;
        loop{match r.read_event().map_err(|_|"表格结构损坏")?{
            Event::Start(e)if local(e.name().as_ref())==b"c"=>{value.clear();kind.clear();cell.clear();inside=true;for a in e.attributes(){let a=a.map_err(|_|"表格字段损坏")?;let v=a.decode_and_unescape_value(r.decoder()).map_err(|_|"表格编码损坏")?;match a.key.as_ref(){b"t"=>kind=v.into_owned(),b"r"=>cell=v.into_owned(),_=>{}}}},
            Event::Text(e)if inside=>value.push_str(&e.unescape().map_err(|_|"表格文字损坏")?),
            Event::End(e)if local(e.name().as_ref())==b"c"=>{let text=if kind=="s"{value.parse::<usize>().ok().and_then(|i|shared.get(i)).cloned().unwrap_or_default()}else{value.clone()};output.push_str(&format!("{cell}: {text}\t"));inside=false},
            Event::End(e)if local(e.name().as_ref())==b"row"=>output.push('\n'),Event::Eof=>break,_=>{}
        }if output.len()>TEXT_LIMIT{return Err("表格内容过多，请按工作表拆分".into())}}
    }Ok(output)
}
fn u32_at(data:&[u8],at:usize)->Result<u32>{Ok(u32::from_le_bytes(data.get(at..at+4).ok_or("PPT 记录越界")?.try_into().map_err(|_|"PPT 记录损坏")?))}
struct Record<'a>{kind:u16,instance:u16,container:bool,body:&'a[u8],next:usize}
fn record(data:&[u8],at:usize)->Result<Record<'_>>{
    let head=data.get(at..at+8).ok_or("PPT 记录头损坏")?;let options=u16::from_le_bytes([head[0],head[1]]);let len=u32_at(data,at+4)? as usize;let next=at.checked_add(8).and_then(|n|n.checked_add(len)).ok_or("PPT 记录长度无效")?;
    Ok(Record{kind:u16::from_le_bytes([head[2],head[3]]),instance:options>>4,container:options&15==15,body:data.get(at+8..next).ok_or("PPT 内容不完整")?,next})
}
fn text_records(data:&[u8],depth:usize,out:&mut Vec<String>)->Result<()>{
    if depth>40{return Err("PPT 嵌套结构过深".into())}let mut at=0;
    while at+8<=data.len(){let r=record(data,at)?;at=r.next;
        if r.kind==4000{if r.body.len()%2!=0{return Err("PPT 中文文字编码损坏".into())}out.push(String::from_utf16(&r.body.chunks_exact(2).map(|p|u16::from_le_bytes([p[0],p[1]])).collect::<Vec<_>>()).map_err(|_|"PPT 文字编码损坏")?)}
        else if r.kind==4008{out.push(encoding_rs::WINDOWS_1252.decode(r.body).0.into_owned())}
        else if r.container||r.kind==0xF00D{text_records(r.body,depth+1,out)?}
    }Ok(())
}
fn legacy_ppt(data:&[u8])->Result<String>{
    let mut file=cfb::CompoundFile::open(Cursor::new(data)).map_err(|_|"不是有效的 PPT；请确认扩展名或另存为 PPTX")?;
    let mut current=Vec::new();file.open_stream("/Current User").map_err(|_|"PPT 缺少当前版本信息")?.take(1024*1024).read_to_end(&mut current).map_err(|_|"PPT 版本信息无法读取")?;
    let mut doc=Vec::new();file.open_stream("/PowerPoint Document").map_err(|_|"PPT 已加密或缺少正文")?.take(256*1024*1024+1).read_to_end(&mut doc).map_err(|_|"PPT 正文无法读取")?;
    let mut offset=u32_at(&current,16)? as usize;let mut seen=HashSet::new();let mut persist=HashMap::new();let mut doc_id=None;
    while offset!=0{if !seen.insert(offset)||seen.len()>10000{return Err("PPT 编辑记录损坏".into())}let edit=record(&doc,offset)?;if edit.kind!=4085{return Err("PPT 当前版本记录无效".into())}if doc_id.is_none(){doc_id=Some(u32_at(edit.body,16)?)}
        let directory=record(&doc,u32_at(edit.body,12)? as usize)?;if directory.kind!=6002{return Err("PPT 对象索引无效或已加密".into())}let mut at=0;
        while at<directory.body.len(){let entry=u32_at(directory.body,at)?;at+=4;let first=entry&0xFFFFF;let count=entry>>20;if count==0{return Err("PPT 对象索引为空".into())}for i in 0..count{let location=u32_at(directory.body,at)? as usize;at+=4;persist.entry(first+i).or_insert(location);}}
        offset=u32_at(edit.body,8)? as usize;
    }
    let document=record(&doc,*persist.get(&doc_id.ok_or("PPT 没有文档索引")?).ok_or("PPT 文档对象缺失")?)?;if document.kind!=1000{return Err("PPT 文档对象无效".into())}
    let(mut at,mut output,mut page,mut notes)=(0,String::new(),0,0);
    while at+8<=document.body.len(){let list=record(document.body,at)?;at=list.next;if list.kind!=4080||![0,2].contains(&list.instance){continue}
        let mut pos=0;let mut groups:Vec<(u32,Vec<String>)>=Vec::new();
        while pos+8<=list.body.len(){let item=record(list.body,pos)?;let start=pos;pos=item.next;if item.kind==1011{groups.push((u32_at(item.body,0)?,Vec::new()))}else if let Some((_,text))=groups.last_mut(){text_records(&list.body[start..pos],0,text)?}}
        for (id,mut text)in groups{if list.instance==0{page+=1;output.push_str(&format!("\n[幻灯片 {page}]\n"));}else{notes+=1;output.push_str(&format!("\n[PPT 备注区 {notes}，独立编号]\n"));}if let Some(location)=persist.get(&id){let slide=record(&doc,*location)?;text_records(slide.body,0,&mut text)?}let mut unique=HashSet::new();for t in text{let t=t.trim_matches('\0').trim();if !t.is_empty()&&unique.insert(t.to_string()){output.push_str(t);output.push('\n')}}if output.len()>TEXT_LIMIT{return Err("PPT 文字过多，请拆分课件".into())}}
    }
    if page==0{return Err("PPT 没有可读取的幻灯片，请另存为 PPTX 后重试".into())}Ok(output)
}
pub fn extract(data:&[u8],extension:&str)->Result<String>{
    let text=if extension=="ppt"{legacy_ppt(data)?}else{
        let mut zip=zip::ZipArchive::new(Cursor::new(data)).map_err(|_|"课件无法解压，可能已加密、损坏或扩展名不匹配")?;
        match extension{"pptx"|"pptm"=>presentation(&mut zip),"docx"=>xml_text(&read_zip(&mut zip,"word/document.xml")?),"xlsx"|"xlsm"=>spreadsheets(&mut zip),"odt"|"odp"|"ods"=>xml_text(&read_zip(&mut zip,"content.xml")?),_=>Err("不支持此 Office 格式".into())}?
    };
    let useful=text.lines().any(|line|{let s=line.trim();!s.is_empty()&&!s.starts_with("[幻灯片 ")&&s!="[本页备注]"&&!s.starts_with("[PPT 备注区 ")&&!s.starts_with("[工作表 ")});
    if !useful{return Err("课件没有可提取的正文，可能是纯图片课件；可用课件切片或页面截图直接向视觉模型提问".into())}Ok(text)
}
