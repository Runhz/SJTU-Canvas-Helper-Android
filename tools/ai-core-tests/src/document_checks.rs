use crate::{pdf_text,context};
fn pdf()->Vec<u8>{
 let texts=["CANVAS PDF EVIDENCE 314159","SECOND PAGE EQUATION 271828"];
 let stream=|text:&str|{let body=format!("BT /F1 20 Tf 72 720 Td ({text}) Tj ET");format!("<< /Length {} >>\nstream\n{}\nendstream",body.len(),body)};
 let objects=vec!["<< /Type /Catalog /Pages 2 0 R >>".to_string(),"<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>".into(),"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>".into(),"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into(),"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>".into(),stream(texts[0]),stream(texts[1])];
 let mut pdf="%PDF-1.4\n".to_string();let mut offsets=vec![0];
 for(i,object)in objects.iter().enumerate(){offsets.push(pdf.len());pdf.push_str(&format!("{} 0 obj\n{}\nendobj\n",i+1,object));}
 let xref=pdf.len();pdf.push_str("xref\n0 8\n0000000000 65535 f \n");for offset in offsets.iter().skip(1){pdf.push_str(&format!("{offset:010} 00000 n \n"));}
 pdf.push_str(&format!("trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"));pdf.into_bytes()
}
#[test]fn actual_pdf_reader_keeps_both_pages_and_their_text(){let text=pdf_text::extract(&pdf()).unwrap();assert!(text.contains("314159"));assert!(text.contains("271828"));assert!(text.find("[PDF 第 1 页]").unwrap()<text.find("[PDF 第 2 页]").unwrap());assert!(pdf_text::extract(b"broken pdf").is_err());}
#[test]fn tiny_context_budgets_do_not_expand_to_an_unrequested_thousand_chars(){let text="中文资料和公式\n".repeat(1000);for budget in [0,50,500,1000,6000]{let chosen=context::select(&text,"公式",budget);assert!(chosen.text.chars().count()<=budget);}}
#[tokio::test]async fn actual_http_request_contains_extracted_pdf_and_reasoning_has_its_own_stream(){
 use tokio::{net::TcpListener,io::{AsyncReadExt,AsyncWriteExt}};use serde_json::json;
 let listener=TcpListener::bind("127.0.0.1:0").await.unwrap();let addr=listener.local_addr().unwrap();
 let server=tokio::spawn(async move{
  let(mut socket,_)=listener.accept().await.unwrap();let mut bytes=Vec::new();let mut buffer=[0;4096];
  let (header_end,length)=loop{let n=socket.read(&mut buffer).await.unwrap();assert!(n>0);bytes.extend_from_slice(&buffer[..n]);assert!(bytes.len()<256000);if let Some(end)=bytes.windows(4).position(|b|b==b"\r\n\r\n"){let header=String::from_utf8_lossy(&bytes[..end]).to_lowercase();let length=header.lines().find_map(|l|l.strip_prefix("content-length:").and_then(|v|v.trim().parse::<usize>().ok())).unwrap();break(end+4,length)}};
  while bytes.len()<header_end+length{let n=socket.read(&mut buffer).await.unwrap();assert!(n>0);bytes.extend_from_slice(&buffer[..n]);}
  let request:serde_json::Value=serde_json::from_slice(&bytes[header_end..header_end+length]).unwrap();
  let messages=request["messages"].as_array().unwrap();assert!(!messages[0]["content"].as_str().unwrap().contains("314159"));assert!(messages.last().unwrap()["content"].as_str().unwrap().contains("314159"));assert!(messages.last().unwrap()["content"].as_str().unwrap().contains("[PDF 第 2 页]"));
  let thinking=json!({"choices":[{"delta":{"reasoning_content":"先核对 PDF 页码。"}}]});let answer=json!({"choices":[{"delta":{"content":"已读取文件中的 314159。"},"finish_reason":"stop"}]});
  socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\ndata: {thinking}\n\ndata: {answer}\n\ndata: [DONE]\n\n").as_bytes()).await.unwrap();
 });
 let args=json!({"fileName":"fixture.pdf"});let system=crate::learning_context::system(&args,"解释 PDF");let data=json!({"title":"fixture.pdf","body":pdf_text::extract(&pdf()).unwrap()});
 let messages=crate::learning_context::messages(system,data,&[("user","解释 PDF")],&[]);let(mut thought,mut answer)=(String::new(),String::new());
 let result=crate::transport::stream_with_reasoning(&format!("http://{addr}/v1"),"fixture-key","fixture-model",messages,&mut |s|answer.push_str(&s),&mut |_|{},&mut |s|thought.push_str(&s)).await.unwrap();
 assert_eq!(thought,"先核对 PDF 页码。");assert_eq!(answer,result);assert!(!result.contains("先核对"));server.await.unwrap();
}
