use crate::error::{AppError, Result};
use async_trait::async_trait;
use bytes::Bytes;
use std::collections::HashMap;

mod docx;
mod pdf;
mod pdf_text;
pub mod office;

#[async_trait]
pub trait FileParser: Send + Sync {
    async fn parse(&self, data: Bytes) -> Result<String>;
}

pub struct GenericFileParser {
    dispatcher: HashMap<String, Box<dyn FileParser>>,
}

impl GenericFileParser {
    pub async fn parse(&self, data: Bytes, extension: &str) -> Result<String> {
        let extension=extension.to_ascii_lowercase();
        if ["ppt","pptx","pptm","docx","xlsx","xlsm","odt","odp","ods"].contains(&extension.as_str()){
            return office::extract(&data,&extension).map_err(AppError::LLMError);
        }
        if ["txt","md","csv","json","yaml","yml","py","c","cpp","h","hpp","rs","js","ts","tsx","jsx","java","ipynb","tex","latex","xml","html","htm","log","rst","srt","vtt","sql","m","r","toml","ini"].contains(&extension.as_str()) {
            let text=match String::from_utf8(data.to_vec()){Ok(s)=>s,Err(_)=>{let(s,_,bad)=encoding_rs::GB18030.decode(&data);if bad{return Err(AppError::LLMError("文本编码无法识别，请另存为 UTF-8".into()));}s.into_owned()}};
            return Ok(text);
        }
        let parser = self
            .dispatcher
            .get(&extension)
            .ok_or(AppError::UnsupportedFileExtensionError(extension.into()))?;

        parser.parse(data).await
    }
}

pub fn new_generic_file_reader() -> GenericFileParser {
    let dispatcher = HashMap::from([("pdf".into(), pdf::new()), ("docx".into(), docx::new())]);
    GenericFileParser { dispatcher }
}
