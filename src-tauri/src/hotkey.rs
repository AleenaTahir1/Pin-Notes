use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use crate::window::spawn_new_note_at_cursor;

pub fn register_global_hotkey(app: &AppHandle) -> Result<(), String> {
    // Alt+Shift+N - avoids conflicts with common Windows shortcuts
    let shortcut = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyN);
    
    let app_handle = app.clone();
    
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, _event| {
            if let Err(e) = spawn_new_note_at_cursor(&app_handle) {
                eprintln!("Failed to spawn new note: {}", e);
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}
