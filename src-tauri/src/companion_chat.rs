use tauri::AppHandle;
#[cfg(target_os = "android")]
use tauri::{Manager, plugin::{Builder, PluginHandle, TauriPlugin}};
#[cfg(target_os = "android")]
struct CompanionBridge(PluginHandle<tauri::Wry>);
#[cfg(target_os = "android")]
pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("companion-chat").setup(|app, api| {
        let handle = api.register_android_plugin("com.oraedameun.album", "GamjassakCompanionPlugin")?;
        app.manage(CompanionBridge(handle)); Ok(())
    }).build()
}
#[cfg(target_os = "android")]
fn call(app: &AppHandle, command: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
    app.state::<CompanionBridge>().0.run_mobile_plugin(command, args).map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn chat_model_status(app: AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    { tauri::async_runtime::spawn_blocking(move || call(&app, "modelStatus", serde_json::json!({}))).await.map_err(|e| e.to_string())? }
    #[cfg(not(target_os = "android"))]
    { let _ = app; Ok(serde_json::json!({"phase":"unsupported","supported":false,"installed":false,"downloaded":0,"total":0,
        "message":"AI 대화는 RAM 8GB 이상 Android 스마트폰에서 사용할 수 있어요."})) }
}
#[tauri::command]
pub async fn download_chat_model(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    { tauri::async_runtime::spawn_blocking(move || call(&app, "downloadModel", serde_json::json!({})).map(|_| ())).await.map_err(|e| e.to_string())? }
    #[cfg(not(target_os = "android"))]
    { let _ = app; Err("Android 스마트폰에서 준비해 주세요.".into()) }
}
#[tauri::command]
pub async fn generate_chat_reply(app: AppHandle, prompt: String) -> Result<String, String> {
    if prompt.trim().is_empty() || prompt.chars().count() > 12000 { return Err("이야기를 12000자 이내로 적어 주세요.".into()); }
    #[cfg(target_os = "android")]
    { tauri::async_runtime::spawn_blocking(move || {
        let value = call(&app, "generate", serde_json::json!({"prompt":prompt}))?;
        value.get("text").and_then(|x| x.as_str()).map(str::to_owned).ok_or_else(|| "답변을 받지 못했어요.".into())
    }).await.map_err(|e| e.to_string())? }
    #[cfg(not(target_os = "android"))]
    { let _ = app; Err("Android 스마트폰에서 대화해 주세요.".into()) }
}
#[tauri::command]
pub async fn stop_chat_model(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    { tauri::async_runtime::spawn_blocking(move || call(&app, "stop", serde_json::json!({})).map(|_| ())).await.map_err(|e| e.to_string())? }
    #[cfg(not(target_os = "android"))]
    { let _ = app; Ok(()) }
}
