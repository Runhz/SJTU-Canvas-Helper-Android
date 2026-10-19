//! Small OpenAI-compatible transport shared by file/material chat and model discovery.
use serde_json::{json,Value};
use futures::StreamExt;
pub type Result<T>=std::result::Result<T,String>;
pub fn endpoint(base:&str,operation:&str)->Result<String>{
    let mut url=reqwest::Url::parse(base.trim()).map_err(|_|"模型服务地址无效")?;
    let local=matches!(url.host_str(),Some("localhost"|"127.0.0.1"|"[::1]"));
    if url.scheme()!="https"&&!(local&&url.scheme()=="http"){return Err("模型服务需要 HTTPS 地址".into())}
    if !url.username().is_empty()||url.password().is_some()||url.query().is_some()||url.fragment().is_some(){return Err("服务地址不能包含账号、Key、查询参数或片段".into())}
    let path=url.path().trim_end_matches('/');let path=path.strip_suffix("/chat/completions").or_else(||path.strip_suffix("/models")).unwrap_or(path);
    url.set_path(&format!("{path}/{operation}"));Ok(url.into())
}
fn http()->Result<reqwest::Client>{reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).connect_timeout(std::time::Duration::from_secs(20)).timeout(std::time::Duration::from_secs(300)).build().map_err(|_|"无法创建模型连接".into())}
fn status_message(status:reqwest::StatusCode)->String{match status.as_u16(){401|403=>"模型服务拒绝鉴权，请核对 API Key 和模型权限".into(),404=>"模型接口或模型名称不存在，请检查服务地址和模型列表".into(),413=>"[CONTEXT_LIMIT] 请求超过模型容量".into(),429=>"模型服务限流或额度不足，请稍后重试".into(),400|422=>"模型拒绝请求，请检查模型名称、上下文长度以及服务是否兼容 Chat Completions".into(),_=>format!("模型服务返回 HTTP {}",status.as_u16())}}
pub async fn models(base:&str,key:&str)->Result<Vec<String>>{
    let list=model_metadata(base,key).await?;
    let mut ids:Vec<_>=list.iter().filter_map(|v|v["id"].as_str().or_else(||v.as_str())).filter(|s|!s.is_empty()&&s.len()<256).map(str::to_owned).collect();ids.sort();ids.dedup();if ids.is_empty(){return Err("服务返回空模型列表，可手动输入模型名".into())}Ok(ids)
}
pub async fn model_metadata(base:&str,key:&str)->Result<Vec<Value>>{
    let response=http()?.get(endpoint(base,"models")?).bearer_auth(key.trim()).send().await.map_err(|_|"获取模型列表失败，请检查网络和服务地址")?;
    if !response.status().is_success(){return Err(status_message(response.status()))}
    if response.content_length().is_some_and(|n|n>4*1024*1024){return Err("模型列表响应过大".into())}
    let body:Value=response.json().await.map_err(|_|"模型服务未返回兼容的列表，可手动输入模型名")?;
    let list=body["data"].as_array().or_else(||body["models"].as_array()).ok_or("服务不支持模型列表，可手动输入模型名")?;
    Ok(list.clone())
}
#[derive(Default)]
pub struct SseDecoder{pending:Vec<u8>,data:Vec<String>,pub done:bool}
impl SseDecoder{
    pub fn push(&mut self,bytes:&[u8])->Result<Vec<Value>>{
        self.pending.extend_from_slice(bytes);if self.pending.len()>4*1024*1024{return Err("模型流式响应块过大".into())}let mut output=Vec::new();
        while let Some(end)=self.pending.iter().position(|b|*b==b'\n'){
            let line=self.pending.drain(..=end).collect::<Vec<_>>();let line=std::str::from_utf8(&line).map_err(|_|"模型流式响应编码无效")?.trim_end_matches(['\n','\r']);
            if line.is_empty(){if let Some(value)=self.flush()?{output.push(value)}}else if let Some(s)=line.strip_prefix("data:"){self.data.push(s.strip_prefix(' ').unwrap_or(s).to_string());}
        }Ok(output)
    }
    fn flush(&mut self)->Result<Option<Value>>{let data=std::mem::take(&mut self.data).join("\n");if data.trim()=="[DONE]"{self.done=true;return Ok(None)}if data.trim().is_empty(){return Ok(None)}serde_json::from_str(&data).map(Some).map_err(|_|"模型流式数据格式不兼容".to_string())}
    pub fn finish(&mut self)->Result<Vec<Value>>{let mut output=self.push(b"\n\n")?;if let Some(v)=self.flush()?{output.push(v)}Ok(output)}
}
fn content(value:&Value)->String{if let Some(s)=value.as_str(){s.to_owned()}else{value.as_array().map(|a|a.iter().filter_map(|v|v["text"].as_str()).collect()).unwrap_or_default()}}
#[derive(Default)]
struct CompletionEnd { reason:Option<String> }
impl CompletionEnd {
    fn observe(&mut self,value:&Value){if let Some(reason)=value["choices"][0]["finish_reason"].as_str(){self.reason=Some(reason.to_owned())}}
    fn validate(&self,done:bool)->Result<()>{match self.reason.as_deref(){
        Some("length")=>Err("[INCOMPLETE] 回答达到服务的生成长度上限，已有内容已保留，可继续生成".into()),
        Some("content_filter")=>Err("回答被模型服务提前结束，已有内容已保留".into()),
        Some("stop")=>Ok(()),
        _ if done=>Ok(()),
        _=>Err("[INCOMPLETE] 回答连接提前结束，已有内容已保留，可继续生成".into()),
    }}
}
pub async fn stream(base:&str,key:&str,model:&str,messages:Value,on_text:&mut(dyn FnMut(String)+Send),on_phase:&mut(dyn FnMut(String)+Send))->Result<String>{
    stream_with_reasoning(base,key,model,messages,on_text,on_phase,&mut |_|{}).await
}
fn reasoning_text(value:&Value)->String{
    let text=content(&value["reasoning_content"]);if !text.is_empty(){return text}
    let text=content(&value["reasoning"]);if !text.is_empty(){return text}
    value["reasoning_details"].as_array().map(|items|items.iter().filter(|v|v["type"].as_str()!=Some("reasoning.encrypted")).filter_map(|v|v["text"].as_str().or_else(||v["summary"].as_str())).collect::<Vec<_>>().join("\n")).unwrap_or_default()
}
pub async fn stream_with_reasoning(base:&str,key:&str,model:&str,messages:Value,on_text:&mut(dyn FnMut(String)+Send),on_phase:&mut(dyn FnMut(String)+Send),on_reasoning:&mut(dyn FnMut(String)+Send))->Result<String>{
    if key.trim().is_empty()||model.trim().is_empty(){return Err("请先配置模型名称和 API Key".into())}
    on_phase("正在连接模型服务…".into());
    let modern=model.to_ascii_lowercase();
    let mut limit_name=if modern.contains("mimo")||modern.starts_with("gpt-5")||modern.starts_with("o1")||modern.starts_with("o3")||modern.starts_with("o4"){"max_completion_tokens"}else{"max_tokens"};
    let mut attempt=0;
    let response=loop {
        let mut body=json!({"model":model,"messages":messages,"stream":true});body[limit_name]=json!(16384);
        let response=http()?.post(endpoint(base,"chat/completions")?).bearer_auth(key.trim()).header(reqwest::header::ACCEPT,"text/event-stream").json(&body).send().await.map_err(|e|if e.is_timeout(){"模型连接超时，请重试"}else{"无法连接模型服务，请检查网络与地址"})?;
        if matches!(response.status().as_u16(),400|422)&&attempt==0 {
            let status=response.status();let body:Value=response.json().await.unwrap_or_default();let message=body["error"]["message"].as_str().unwrap_or("").to_ascii_lowercase();
            if message.contains(limit_name)&&["unsupported","not supported","unknown","unrecognized","not allowed"].iter().any(|s|message.contains(s)) {limit_name=if limit_name=="max_tokens"{"max_completion_tokens"}else{"max_tokens"};attempt+=1;continue}
            if message.contains("context")||message.contains("too many tokens"){return Err("[CONTEXT_LIMIT] 资料超过模型容量".into())}
            if message.contains("image")&&(message.contains("not support")||message.contains("unsupported")||message.contains("invalid content")){return Err("当前模型或服务不接受图片，请切换支持图片的模型".into())}
            return Err(status_message(status));
        }
        break response;
    };
    if !response.status().is_success(){
        let status=response.status();
        if matches!(status.as_u16(),400|413|422){
            let body:Value=response.json().await.unwrap_or_default();
            let code=body["error"]["code"].as_str().unwrap_or("").to_ascii_lowercase();
            let message=body["error"]["message"].as_str().unwrap_or("").to_ascii_lowercase();
            if status.as_u16()==413||code.contains("context_length")||message.contains("maximum context")||message.contains("context length")||message.contains("too many tokens"){return Err("[CONTEXT_LIMIT] 资料超过模型容量".into())}
            if message.contains("image")&&(message.contains("not support")||message.contains("unsupported")||message.contains("invalid content")){return Err("当前模型或服务不接受图片，请切换支持图片的模型".into())}
        }
        return Err(status_message(status))
    }
    let is_json=response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|s|s.to_str().ok()).is_some_and(|s|s.contains("application/json"));
    if is_json{on_phase("服务返回普通响应，正在等待完整内容…".into());let body:Value=response.json().await.map_err(|_|"模型响应解析失败")?;let thinking=reasoning_text(&body["choices"][0]["message"]);if !thinking.is_empty(){on_reasoning(thinking)}let text=content(&body["choices"][0]["message"]["content"]);if text.is_empty(){return Err("模型没有返回正文".into())}on_text(text.clone());let mut end=CompletionEnd::default();end.observe(&body);end.validate(true)?;return Ok(text)}
    let mut decoder=SseDecoder::default();let mut body=response.bytes_stream();let mut full=String::new();let mut end=CompletionEnd::default();let mut consume=|v:Value|->Result<()>{if v.get("error").is_some(){return Err("模型在生成中返回错误，请检查服务额度或上下文设置".into())}end.observe(&v);let delta=&v["choices"][0]["delta"];let thinking=reasoning_text(delta);if !thinking.is_empty(){on_phase("模型正在思考…".into());on_reasoning(thinking)}let text=content(&delta["content"]);if !text.is_empty(){on_phase("正在回答…".into());full.push_str(&text);on_text(text);}Ok(())};
    while let Some(bytes)=body.next().await{for event in decoder.push(&bytes.map_err(|_|"回答连接中断，已收到的内容已保留")?)?{consume(event)?}if decoder.done{break}}
    for event in decoder.finish()?{consume(event)?}end.validate(decoder.done)?;if full.trim().is_empty(){return Err("模型没有返回正文，请检查该模型是否支持此接口".into())}Ok(full)
}

#[cfg(test)] mod tests{
    use super::*;
    #[test]fn reasoning_is_provider_text_only_and_never_encrypted_payload(){assert_eq!(reasoning_text(&json!({"reasoning_content":"实际思考"})),"实际思考");assert_eq!(reasoning_text(&json!({"reasoning_details":[{"type":"reasoning.encrypted","text":"SECRET"},{"type":"reasoning.summary","summary":"可见摘要"}]})),"可见摘要");assert_eq!(reasoning_text(&json!({"content":"只有答案"})),"");}
    #[test] fn distinguishes_length_and_missing_terminal_from_complete(){let mut end=CompletionEnd::default();assert!(end.validate(false).unwrap_err().contains("[INCOMPLETE]"));end.observe(&json!({"choices":[{"finish_reason":"length"}]}));assert!(end.validate(true).unwrap_err().contains("生成长度"));end.observe(&json!({"choices":[{"finish_reason":"stop"}]}));assert!(end.validate(false).is_ok());}
    #[test] fn decodes_split_chinese_and_terminal_without_losing_the_tail(){let input="data: {\"choices\":[{\"delta\":{\"content\":\"完整中文尾句。\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n";for step in 1..16{let mut decoder=SseDecoder::default();let mut events=Vec::new();for chunk in input.as_bytes().chunks(step){events.extend(decoder.push(chunk).unwrap())}events.extend(decoder.finish().unwrap());assert!(decoder.done);assert_eq!(content(&events[0]["choices"][0]["delta"]["content"]),"完整中文尾句。");}}
}
