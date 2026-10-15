//! Android entrypoint. Only the main-campus, student-facing command facade is registered.
#![allow(dead_code, unused_imports)]
mod client;
mod error;
mod model;
mod utils;
mod mobile;
mod ai_transport;
mod ai_context;
mod model_capabilities;

// Pure timeline processing is shared with the upstream client tests.
pub mod app { pub mod ppt; }

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(mobile::native_plugin())
        .manage(mobile::MobileState::default())
        .invoke_handler(tauri::generate_handler![
            mobile::configure_session,
            mobile::restore_session,
            mobile::clear_session,
            mobile::canvas_request,
            mobile::submit_work,
            mobile::ai_chat,
            mobile::cancel_ai,
            mobile::list_models,
            mobile::model_capabilities,
            mobile::test_model,
            mobile::native_call,
            mobile::start_qr_login,
            mobile::finish_qr_login,
            mobile::cancel_qr_login,
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Canvas mobile");
}
