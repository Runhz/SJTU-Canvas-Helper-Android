type Result<T> = std::result::Result<T,String>;

// DPAPI binds saved credentials to the current Windows user. Nothing is logged.
#[cfg(windows)]
pub fn protect(bytes: &[u8], decrypt: bool) -> Result<Vec<u8>> {
    #[repr(C)] struct Blob { len: u32, data: *mut u8 }
    #[link(name="crypt32")] extern "system" {
        fn CryptProtectData(input: *const Blob, description: *const u16, entropy: *const Blob, reserved: *mut std::ffi::c_void, prompt: *mut std::ffi::c_void, flags: u32, output: *mut Blob) -> i32;
        fn CryptUnprotectData(input: *const Blob, description: *mut *mut u16, entropy: *const Blob, reserved: *mut std::ffi::c_void, prompt: *mut std::ffi::c_void, flags: u32, output: *mut Blob) -> i32;
    }
    #[link(name="kernel32")] extern "system" { fn LocalFree(pointer: *mut std::ffi::c_void) -> *mut std::ffi::c_void; }
    if bytes.len() > u32::MAX as usize { return Err("配置过大".into()); }
    let input=Blob {len:bytes.len() as u32,data:bytes.as_ptr() as *mut u8};
    let mut output=Blob {len:0,data:std::ptr::null_mut()};
    unsafe {
        let ok=if decrypt { CryptUnprotectData(&input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),1,&mut output) }
            else { CryptProtectData(&input,std::ptr::null(),std::ptr::null(),std::ptr::null_mut(),std::ptr::null_mut(),1,&mut output) };
        if ok==0 { return Err("Windows 无法读取或保护本机配置，请在当前用户下重新连接".into()); }
        let result=std::slice::from_raw_parts(output.data,output.len as usize).to_vec();
        LocalFree(output.data.cast()); Ok(result)
    }
}
#[cfg(not(windows))]
pub fn protect(bytes:&[u8], _decrypt:bool)->Result<Vec<u8>> { Ok(bytes.to_vec()) }

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn chinese_json_roundtrip() {
        let original=r#"{"accountId":"交大学习账号","title":"数学 α → 50%","token":"test-private-token"}"#;
        let encrypted=protect(original.as_bytes(),false).unwrap();
        #[cfg(windows)] {
            assert_ne!(encrypted,original.as_bytes());
            assert!(!encrypted.windows(18).any(|part|part==b"test-private-token"));
        }
        let decoded=String::from_utf8(protect(&encrypted,true).unwrap()).unwrap();
        assert_eq!(decoded,original);
        for marker in ["\u{fffd}","锟斤拷","Ã","â€"]{assert!(!decoded.contains(marker));}
    }
    #[cfg(windows)]
    #[test] fn corrupted_credentials_do_not_return_plaintext(){assert!(protect(b"broken credential file",true).is_err());}
}

