use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::window::{create_notes_list_window, spawn_new_note_at_cursor};

pub fn register_global_hotkey(app: &AppHandle) -> Result<(), String> {
    // Ctrl+Alt+P — create a new note (P for Pin Notes)
    let new_note_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP);
    let app_handle_n = app.clone();

    app.global_shortcut()
        .on_shortcut(new_note_shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Err(e) = spawn_new_note_at_cursor(&app_handle_n) {
                    eprintln!("Failed to spawn new note: {}", e);
                }
            }
        })
        .map_err(|e| e.to_string())?;

    // Ctrl+Alt+L — open the notes list
    let list_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyL);
    let app_handle_l = app.clone();

    app.global_shortcut()
        .on_shortcut(list_shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Err(e) = create_notes_list_window(&app_handle_l) {
                    eprintln!("Failed to open notes list: {}", e);
                }
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}
