use crate::storage::Note;
use tauri::image::Image;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const APP_ICON: &[u8] = include_bytes!("../icons/icon.png");

fn app_icon() -> Result<Image<'static>, String> {
    Image::from_bytes(APP_ICON).map_err(|e| e.to_string())
}

pub fn create_note_window(app: &AppHandle, note: &Note) -> Result<(), String> {
    let window_label = format!("note-{}", note.id);

    // Check if window already exists
    if app.get_webview_window(&window_label).is_some() {
        return Ok(());
    }

    let url = WebviewUrl::App(format!("index.html?noteId={}", note.id).into());

    let window = WebviewWindowBuilder::new(app, &window_label, url)
        .title("Pin Note")
        .inner_size(note.width as f64, note.height as f64)
        .position(note.position_x as f64, note.position_y as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        .visible(true)
        .icon(app_icon()?)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

pub fn create_notes_list_window(app: &AppHandle) -> Result<(), String> {
    let window_label = "notes-list";

    // If already open, focus it
    if let Some(window) = app.get_webview_window(window_label) {
        let _ = window.set_focus();
        return Ok(());
    }

    let url = WebviewUrl::App("index.html?view=list".into());

    let window = WebviewWindowBuilder::new(app, window_label, url)
        .title("Pin Notes")
        .inner_size(300.0, 480.0)
        .position(50.0, 50.0)
        .decorations(false)
        .always_on_top(true)
        .resizable(true)
        .visible(true)
        .icon(app_icon()?)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

pub fn spawn_new_note_at_cursor(app: &AppHandle) -> Result<(), String> {
    use crate::storage::NotesStorage;

    let position_x = 200;
    let position_y = 200;

    let color = "#fff9c4".to_string();

    let id = uuid::Uuid::new_v4().to_string();
    let note = Note::new(id, color, position_x, position_y);

    let storage = app.state::<NotesStorage>();
    let saved_note = storage.create_note(note)?;

    create_note_window(app, &saved_note)?;

    Ok(())
}

pub fn restore_all_notes(app: &AppHandle) -> Result<(), String> {
    use crate::storage::NotesStorage;

    let storage = app.state::<NotesStorage>();
    let notes = storage.get_all_notes()?;

    for note in notes {
        if note.is_visible {
            create_note_window(app, &note)?;
        }
    }

    Ok(())
}
