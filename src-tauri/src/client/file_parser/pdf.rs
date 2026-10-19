use super::FileParser;
use crate::error::Result;
use async_trait::async_trait;
use bytes::Bytes;

struct PdfParser {}

#[async_trait]
impl FileParser for PdfParser {
    async fn parse(&self, data: Bytes) -> Result<String> {
        Ok(super::pdf_text::extract(&data)?)
    }
}

pub fn new() -> Box<dyn FileParser> {
    Box::new(PdfParser {})
}
