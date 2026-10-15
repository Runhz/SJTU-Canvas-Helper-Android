use serde::{Deserialize,Serialize};
use serde_json::Value;
#[derive(Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ModelCapabilities {
    pub context_tokens:Option<usize>,
    pub vision:Option<bool>,
    pub max_file_bytes:Option<u64>,
    pub input_types:Vec<String>,
}
impl ModelCapabilities {
    pub fn from_metadata(value:&Value)->Self {
        let context_tokens=[&value["context_length"],&value["context_window"],&value["max_input_tokens"],&value["top_provider"]["context_length"]].into_iter().filter_map(|n|n.as_u64()).filter(|n|*n>=1024).min().map(|n|n.min(2_000_000) as usize);
        let modalities=value["architecture"]["input_modalities"].as_array().or_else(||value["input_modalities"].as_array());
        let input_types=modalities.map(|items|items.iter().filter_map(|v|v.as_str().map(str::to_owned)).collect::<Vec<_>>()).unwrap_or_default();
        let vision=if modalities.is_some(){Some(input_types.iter().any(|s|s=="image"))}else{value["capabilities"]["vision"].as_bool()};
        Self {context_tokens,vision,max_file_bytes:value["max_file_bytes"].as_u64(),input_types}
    }
    pub fn text_budget(&self,history_chars:usize)->usize {
        // A conservative character budget also accommodates Chinese tokenization and the reply.
        self.context_tokens.map(|tokens|(tokens*3/4).saturating_sub(history_chars+4096)).unwrap_or(24_000).clamp(2_000,512_000)
    }
}
#[cfg(test)]mod tests{
    use super::*;use serde_json::json;
    #[test]fn metadata_is_used_without_guessing_model_names(){let c=ModelCapabilities::from_metadata(&json!({"id":"vision-in-name","context_length":32000,"architecture":{"input_modalities":["text"]}}));assert_eq!(c.vision,Some(false));assert_eq!(c.text_budget(1000),18904);assert_eq!(ModelCapabilities::default().vision,None);}
}
