#![allow(dead_code)]
#[path="../../../src-tauri/src/client/file_parser/office.rs"]mod office;
fn main(){for path in std::env::args().skip(1){let bytes=std::fs::read(&path).expect("fixture exists");let ext=std::path::Path::new(&path).extension().unwrap().to_str().unwrap();match office::extract(&bytes,ext){Ok(text)=>println!("{}",serde_json::json!({"file":path,"characters":text.chars().count(),"slides":text.matches("[幻灯片 ").count(),"notes":text.matches("[本页备注]").count()})),Err(error)=>{eprintln!("{}",serde_json::json!({"file":path,"error":error}));std::process::exit(1)}}}}
