use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};

use crate::window::{create_notes_list_window, spawn_new_note_at_cursor};

pub fn setup_tray(app: &AppHandle) -> Result<(), String> {
    let new_note = MenuItem::with_id(app, "new_note", "New Note", true, Some("Ctrl+Alt+P"))
        .map_err(|e| e.to_string())?;
    let notes_list = MenuItem::with_id(app, "notes_list", "Notes List", true, Some("Ctrl+Alt+L"))
        .map_err(|e| e.to_string())?;
    let show_all = MenuItem::with_id(app, "show_all", "Show All Notes", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let separator = MenuItem::with_id(app, "separator", "───────────", false, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("Alt+F4"))
        .map_err(|e| e.to_string())?;

    let menu = Menu::with_items(app, &[&new_note, &notes_list, &show_all, &separator, &quit])
        .map_err(|e| e.to_string())?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "new_note" => {
                if let Err(e) = spawn_new_note_at_cursor(app) {
                    eprintln!("Failed to create new note: {}", e);
                }
            }
            "notes_list" => {
                if let Err(e) = create_notes_list_window(app) {
                    eprintln!("Failed to open notes list: {}", e);
                }
            }
            "show_all" => {
                if let Err(e) = crate::window::restore_all_notes(app) {
                    eprintln!("Failed to show all notes: {}", e);
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                // Left click opens the notes list
                if let Err(e) = create_notes_list_window(app) {
                    eprintln!("Failed to open notes list: {}", e);
                }
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(())
}
