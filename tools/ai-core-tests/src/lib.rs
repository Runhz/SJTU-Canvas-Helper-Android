#![allow(dead_code)]
#[path="../../../src-tauri/src/client/file_parser/office.rs"]mod office;
#[path="../../../src-tauri/src/ai_context.rs"]mod context;
use context as ai_context;
#[path="../../../src-tauri/src/ai_transport.rs"]mod transport;
#[path="../../../src-tauri/src/model_capabilities.rs"]mod capabilities;
#[path="../../../src-tauri/src/learning_context.rs"]mod learning_context;
#[path="../../../src-tauri/src/client/file_parser/pdf_text.rs"]mod pdf_text;
#[cfg(test)]mod document_checks;
#[cfg(test)]mod workflow_checks;
#[cfg(test)]mod tests{
    use super::*;
    use std::{io::{Cursor,Write},sync::Arc};
    use serde_json::json;
    fn package(entries:Vec<(&str,String)>)->Vec<u8>{let mut writer=zip::ZipWriter::new(Cursor::new(Vec::new()));for(name,text)in entries{writer.start_file(name,zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored)).unwrap();writer.write_all(text.as_bytes()).unwrap()}writer.finish().unwrap().into_inner()}
    fn slide(s:&str)->String{format!("<p:sld xmlns:p='p' xmlns:a='a'><a:p><a:r><a:t>{s}</a:t></a:r></a:p></p:sld>")}
    #[test]fn pptx_preserves_presentation_order_and_real_note_relationships(){
        let data=package(vec![("ppt/presentation.xml","<p:presentation xmlns:p='p' xmlns:r='r'><p:sldIdLst><p:sldId id='10' r:id='r2'/><p:sldId id='11' r:id='r1'/></p:sldIdLst></p:presentation>".into()),("ppt/_rels/presentation.xml.rels","<Relationships><Relationship Id='r1' Target='slides/slide1.xml' Type='slide'/><Relationship Id='r2' Target='slides/slide10.xml' Type='slide'/></Relationships>".into()),("ppt/slides/slide1.xml",slide("第二页中文")),("ppt/slides/slide10.xml",slide("第一页 &amp; 公式")),("ppt/slides/_rels/slide10.xml.rels","<Relationships><Relationship Id='notes' Target='../notesSlides/notesSlide7.xml' Type='http://schemas/notesSlide'/></Relationships>".into()),("ppt/notesSlides/notesSlide7.xml",slide("教师备注：重点"))]);
        let text=office::extract(&data,"pptx").unwrap();assert!(text.find("第一页").unwrap()<text.find("第二页").unwrap());assert!(text.contains("[本页备注]\n教师备注：重点"));assert!(text.contains("第一页 & 公式"));
    }
    fn rec(kind:u16,options:u16,body:&[u8])->Vec<u8>{let mut out=Vec::new();out.extend(options.to_le_bytes());out.extend(kind.to_le_bytes());out.extend((body.len() as u32).to_le_bytes());out.extend(body);out}
    fn text_atom(s:&str)->Vec<u8>{rec(4000,0,&s.encode_utf16().flat_map(|v|v.to_le_bytes()).collect::<Vec<_>>())}
    #[test]fn legacy_ppt_uses_current_persist_index_instead_of_deleted_slide_text(){
        let mut doc=vec![0;8];doc.extend(rec(1006,15,&text_atom("已删除的历史页面")));let current_slide=doc.len() as u32;doc.extend(rec(1006,15,&text_atom("当前中文课件")));
        let mut persist=vec![0;20];persist[..4].copy_from_slice(&2u32.to_le_bytes());let mut list=rec(1011,0,&persist);list.extend(text_atom("当前中文课件"));let document=doc.len() as u32;doc.extend(rec(1000,15,&rec(4080,15,&list)));
        let directory=doc.len() as u32;let mut values=Vec::new();values.extend(((2u32<<20)|1).to_le_bytes());values.extend(document.to_le_bytes());values.extend(current_slide.to_le_bytes());doc.extend(rec(6002,0,&values));
        let edit_at=doc.len() as u32;let mut edit=vec![0;28];edit[12..16].copy_from_slice(&directory.to_le_bytes());edit[16..20].copy_from_slice(&1u32.to_le_bytes());doc.extend(rec(4085,0,&edit));let mut current=vec![0;24];current[16..20].copy_from_slice(&edit_at.to_le_bytes());
        let mut cfb=cfb::CompoundFile::create(Cursor::new(Vec::new())).unwrap();cfb.create_stream("/PowerPoint Document").unwrap().write_all(&doc).unwrap();cfb.create_stream("/Current User").unwrap().write_all(&current).unwrap();let file=cfb.into_inner().into_inner();
        let text=office::extract(&file,"ppt").unwrap();assert!(text.contains("当前中文课件"));assert!(!text.contains("历史页面"));assert_eq!(text.matches("当前中文课件").count(),1);
    }
    #[test]fn broken_ppt_and_malformed_xml_are_reported(){assert!(office::extract(b"not a presentation","ppt").is_err());assert!(office::extract(b"not a zip","pptx").is_err());assert!(office::xml_text("<a><b></a>").is_err())}
    #[test]fn pptx_larger_than_old_25mb_limit_and_100k_text_limit_is_readable(){
        let text="中文课件正文".repeat(22000);
        let data=package(vec![("ppt/presentation.xml","<p:presentation xmlns:p='p' xmlns:r='r'><p:sldIdLst><p:sldId r:id='r1'/></p:sldIdLst></p:presentation>".into()),("ppt/_rels/presentation.xml.rels","<Relationships><Relationship Id='r1' Target='slides/slide1.xml' Type='slide'/></Relationships>".into()),("ppt/slides/slide1.xml",slide(&text)),("ppt/media/unused-image.bin","x".repeat(26*1024*1024))]);
        assert!(data.len()>25*1024*1024);let extracted=office::extract(&data,"pptx").unwrap();assert!(extracted.chars().count()>100000);assert!(extracted.contains(&text));
    }
    #[test]fn xlsx_resolves_shared_strings(){let data=package(vec![("xl/sharedStrings.xml","<sst><si><t>中文单元格</t></si></sst>".into()),("xl/worksheets/sheet1.xml","<worksheet><row><c r='A1' t='s'><v>0</v></c><c r='B1'><v>3.14</v></c></row></worksheet>".into())]);let text=office::extract(&data,"xlsx").unwrap();assert!(text.contains("A1: 中文单元格"));assert!(text.contains("B1: 3.14"))}
    #[test]fn docx_reads_paragraphs_and_tables_without_layout_engine(){let data=package(vec![("word/document.xml","<w:document xmlns:w='w'><w:body><w:p><w:r><w:t>中文讲义与公式</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>重要表格 314159</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>".into())]);let text=office::extract(&data,"docx").unwrap();assert!(text.contains("中文讲义"));assert!(text.contains("重要表格 314159"));}
    #[test]fn context_preserves_utf8_and_finds_late_relevant_slides(){let text="无关段落\n".repeat(5000)+"[幻灯片99] 唯一概念：拉格朗日乘子\n";let chosen=context::select(&text,"解释拉格朗日乘子",6000);assert!(chosen.text.contains("拉格朗日乘子"));assert!(chosen.used<chosen.total);assert!(chosen.text.is_char_boundary(chosen.text.len()));}
    #[test]fn sse_handles_every_byte_boundary_and_crlf(){let bytes="data: {\"choices\":[{\"delta\":{\"content\":\"中文公式\"}}]}\r\n\r\ndata: [DONE]\r\n\r\n".as_bytes();let mut parser=transport::SseDecoder::default();let mut events=Vec::new();for byte in bytes{events.extend(parser.push(&[*byte]).unwrap())}events.extend(parser.finish().unwrap());assert_eq!(events[0]["choices"][0]["delta"]["content"],"中文公式");assert!(parser.done)}
    #[test]fn endpoint_paths_preserve_service_prefix_and_do_not_duplicate_v1(){assert_eq!(transport::endpoint("https://example.test/proxy/v1/chat/completions","models").unwrap(),"https://example.test/proxy/v1/models");assert!(transport::endpoint("http://example.test/v1","models").is_err());assert!(transport::endpoint("https://user:key@example.test/v1","models").is_err())}
    #[tokio::test]async fn actual_http_sse_delivers_first_chunk_before_server_sends_the_rest(){
        use tokio::{net::TcpListener,io::{AsyncReadExt,AsyncWriteExt}};
        let listener=TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();let notified=Arc::new(tokio::sync::Notify::new());let signal=notified.clone();
        let server=tokio::spawn(async move{let(mut socket,_)=listener.accept().await.unwrap();let mut data=[0;4096];let _=socket.read(&mut data).await.unwrap();socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\n").await.unwrap();tokio::time::timeout(std::time::Duration::from_secs(3),signal.notified()).await.expect("first callback must fire before response end");socket.write_all(b"data: {\"choices\":[{\"delta\":{\"content\":\"second\"}}]}\n\ndata: [DONE]\n\n").await.unwrap();});
        let text=transport::stream(&format!("http://{address}/v1"),"test-only","mock-model",json!([{"role":"user","content":"hello"}]),&mut |s|{if s=="first"{notified.notify_one()}},&mut |_|{}).await.unwrap();assert_eq!(text,"firstsecond");server.await.unwrap();
    }
}
