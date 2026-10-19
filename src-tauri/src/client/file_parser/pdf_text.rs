pub fn extract(data:&[u8])->Result<String,pdf_extract::OutputError>{
 let pages=pdf_extract::extract_text_from_mem_by_pages(data)?;
 Ok(pages.iter().enumerate().map(|(i,text)|format!("[PDF 第 {} 页]\n{}",i+1,text)).collect::<Vec<_>>().join("\n\n"))
}
