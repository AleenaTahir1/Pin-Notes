mod commands;
mod hotkey;
mod storage;
mod tray;
mod window;

use commands::*;
use storage::NotesStorage;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_positioner::init())
        .manage(NotesStorage::new())
        .invoke_handler(tauri::generate_handler![
            create_note,
            update_note,
            delete_note,
            clear_note,
            open_note,
            open_notes_list,
            get_all_notes,
            get_note,
            update_note_position,
            update_note_size,
            close_note,
            show_all_notes,
        ])
        .setup(|app| {
            // Set up system tray
            if let Err(e) = tray::setup_tray(app.handle()) {
                eprintln!("Failed to setup tray: {}", e);
            }

            // Register global hotkey (Alt+Shift+N)
            if let Err(e) = hotkey::register_global_hotkey(app.handle()) {
                eprintln!("Failed to register global hotkey: {}", e);
            }

            // Open the notes list window
            if let Err(e) = window::create_notes_list_window(app.handle()) {
                eprintln!("Failed to open notes list: {}", e);
            }

            // Restore previously visible notes
            if let Err(e) = window::restore_all_notes(app.handle()) {
                eprintln!("Failed to restore notes: {}", e);
            }

            // If no notes exist yet, create one on first run
            if let Some(storage) = app.try_state::<NotesStorage>() {
                if let Ok(notes) = storage.get_all_notes() {
                    if notes.is_empty() {
                        if let Err(e) = window::spawn_new_note_at_cursor(app.handle()) {
                            eprintln!("Failed to create initial note: {}", e);
                        }
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
