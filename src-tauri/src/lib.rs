mod commands;
mod edge_dock;
mod hotkey;
mod i18n;
mod settings;
mod storage;
mod sync;
mod tray;
mod window;

use commands::*;
use settings::SettingsStore;
use storage::NotesStorage;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance MUST be the first plugin registered. It guarantees that
        // launching Pin Notes again (shortcut, autostart, updater relaunch) routes
        // back to the already-running process instead of spawning a second one —
        // which is what was stacking up duplicate icons in the system tray.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second launch happened — just surface the existing notes list
            // instead of starting a new instance.
            if let Err(e) = window::create_notes_list_window(app) {
                eprintln!("Failed to focus notes list on second launch: {}", e);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None::<Vec<&str>>))
        .manage(NotesStorage::new())
        .manage(SettingsStore::new())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_language,
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
            toggle_pin_note,
            show_all_notes,
            set_obsidian_vault,
            disconnect_obsidian,
            get_sync_status,
            sync_obsidian_now,
            get_vault_templates,
            edge_dock::snap_note_to_edge,
            edge_dock::reveal_docked_note,
        ])
        .setup(|app| {
            // Set up system tray
            if let Err(e) = tray::setup_tray(app.handle()) {
                eprintln!("Failed to setup tray: {}", e);
            }

            // Keep the OS autostart entry in sync with the setting on every launch.
            // Windows auto-launch can silently drop the registry entry after one
            // boot (tauri plugins-workspace #771); re-enabling here heals it.
            {
                use tauri_plugin_autostart::ManagerExt;
                let settings = app.state::<SettingsStore>();
                let manager = app.autolaunch();
                let desired = settings.auto_start();
                let actual = manager.is_enabled().unwrap_or(false);
                if desired != actual {
                    let result = if desired { manager.enable() } else { manager.disable() };
                    if let Err(e) = result {
                        eprintln!("Failed to sync auto start: {}", e);
                    }
                }
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

            // Background Obsidian sync: every few seconds reconcile storage with the
            // connected vault (no-op when no vault is configured). This is what pulls
            // edits made inside Obsidian back into Pin Notes.
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    let settings = handle.state::<SettingsStore>();
                    if let Some(vault) = settings.vault_path() {
                        let storage = handle.state::<NotesStorage>();
                        sync::sync_once(&storage, std::path::Path::new(&vault));
                    }
                });
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
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
                // Keep the app alive in the tray ONLY when it's the windows closing
                // (code == None) — so global shortcuts keep working. An explicit Quit
                // from the tray calls `app.exit(0)`, which sets code == Some(0); in that
                // case we must let the app actually exit.
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
