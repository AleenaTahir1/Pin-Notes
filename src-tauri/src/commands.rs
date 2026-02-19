use crate::storage::{Note, NotesStorage};
use crate::window::{create_note_window, create_notes_list_window};
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn create_note(
    app: AppHandle,
    storage: State<'_, NotesStorage>,
    color: String,
    position_x: i32,
    position_y: i32,
) -> Result<Note, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let note = Note::new(id.clone(), color, position_x, position_y);
    let saved_note = storage.create_note(note)?;

    create_note_window(&app, &saved_note)?;

    Ok(saved_note)
}

#[tauri::command]
pub async fn update_note(
    storage: State<'_, NotesStorage>,
    note: Note,
) -> Result<Note, String> {
    let mut updated = note;
    updated.updated_at = chrono::Utc::now().timestamp();
    storage.update_note(updated)
}

#[tauri::command]
pub async fn delete_note(
    app: AppHandle,
    storage: State<'_, NotesStorage>,
    id: String,
) -> Result<(), String> {
    // Close the window if it exists
    if let Some(window) = app.get_webview_window(&format!("note-{}", id)) {
        let _ = window.close();
    }
    storage.delete_note(&id)
}

#[tauri::command]
pub async fn clear_note(
    storage: State<'_, NotesStorage>,
    id: String,
) -> Result<Note, String> {
    if let Some(mut note) = storage.get_note(&id)? {
        note.content = String::new();
        note.updated_at = chrono::Utc::now().timestamp();
        storage.update_note(note)
    } else {
        Err("Note not found".to_string())
    }
}

#[tauri::command]
pub async fn open_note(
    app: AppHandle,
    storage: State<'_, NotesStorage>,
    id: String,
) -> Result<(), String> {
    let window_label = format!("note-{}", id);

    // If window already exists, focus it
    if let Some(window) = app.get_webview_window(&window_label) {
        let _ = window.set_focus();
        return Ok(());
    }

    // Otherwise, create the window
    if let Some(note) = storage.get_note(&id)? {
        let mut updated = note.clone();
        updated.is_visible = true;
        storage.update_note(updated)?;

        create_note_window(&app, &note)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_notes_list(app: AppHandle) -> Result<(), String> {
    create_notes_list_window(&app)
}

#[tauri::command]
pub async fn get_all_notes(storage: State<'_, NotesStorage>) -> Result<Vec<Note>, String> {
    storage.get_all_notes()
}

#[tauri::command]
pub async fn get_note(storage: State<'_, NotesStorage>, id: String) -> Result<Option<Note>, String> {
    storage.get_note(&id)
}

#[tauri::command]
pub async fn update_note_position(
    storage: State<'_, NotesStorage>,
    id: String,
    position_x: i32,
    position_y: i32,
) -> Result<(), String> {
    if let Some(mut note) = storage.get_note(&id)? {
        note.position_x = position_x;
        note.position_y = position_y;
        note.updated_at = chrono::Utc::now().timestamp();
        storage.update_note(note)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn update_note_size(
    storage: State<'_, NotesStorage>,
    id: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if let Some(mut note) = storage.get_note(&id)? {
        note.width = width;
        note.height = height;
        note.updated_at = chrono::Utc::now().timestamp();
        storage.update_note(note)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn close_note(
    app: AppHandle,
    storage: State<'_, NotesStorage>,
    id: String,
) -> Result<(), String> {
    if let Some(mut note) = storage.get_note(&id)? {
        note.is_visible = false;
        storage.update_note(note)?;
    }

    if let Some(window) = app.get_webview_window(&format!("note-{}", id)) {
        let _ = window.close();
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_pin_note(
    storage: State<'_, NotesStorage>,
    id: String,
) -> Result<Note, String> {
    if let Some(mut note) = storage.get_note(&id)? {
        note.is_pinned = !note.is_pinned;
        note.updated_at = chrono::Utc::now().timestamp();
        storage.update_note(note)
    } else {
        Err("Note not found".to_string())
    }
}

#[tauri::command]
pub async fn show_all_notes(
    app: AppHandle,
    storage: State<'_, NotesStorage>,
) -> Result<(), String> {
    let notes = storage.get_all_notes()?;
    for note in notes {
        let window_label = format!("note-{}", note.id);
        if app.get_webview_window(&window_label).is_none() {
            create_note_window(&app, &note)?;
        }
        let mut updated = note;
        updated.is_visible = true;
        storage.update_note(updated)?;
    }
    Ok(())
}
