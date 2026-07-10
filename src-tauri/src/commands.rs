use crate::settings::SettingsStore;
use crate::storage::{Note, NotesStorage};
use crate::window::{create_note_window, create_notes_list_window};
use tauri::{AppHandle, Manager, State};

/// If a vault is connected, mirror a single note out to its `.md` file immediately so
/// Obsidian reflects the change without waiting for the next background sync tick.
fn mirror_note(settings: &SettingsStore, note: &Note) {
    if let Some(vault) = settings.vault_path() {
        let _ = crate::sync::write_note_file(std::path::Path::new(&vault), note);
    }
}

/// If a vault is connected, remove the `.md` file for a deleted note.
fn mirror_delete(settings: &SettingsStore, id: &str) {
    if let Some(vault) = settings.vault_path() {
        crate::sync::delete_note_file(std::path::Path::new(&vault), id);
    }
}

#[tauri::command]
pub async fn create_note(
    app: AppHandle,
    storage: State<'_, NotesStorage>,
    settings: State<'_, SettingsStore>,
    color: String,
    position_x: i32,
    position_y: i32,
    content: Option<String>,
) -> Result<Note, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let mut note = Note::new(id.clone(), color, position_x, position_y);
    // Optional starting content — used when creating a note from a template.
    if let Some(c) = content {
        note.content = c;
    }
    let saved_note = storage.create_note(note)?;

    mirror_note(&settings, &saved_note);
    create_note_window(&app, &saved_note)?;

    Ok(saved_note)
}

#[tauri::command]
pub async fn update_note(
    storage: State<'_, NotesStorage>,
    settings: State<'_, SettingsStore>,
    note: Note,
) -> Result<Note, String> {
    let mut updated = note;
    updated.updated_at = chrono::Utc::now().timestamp();
    let saved = storage.update_note(updated)?;
    mirror_note(&settings, &saved);
    Ok(saved)
}

#[tauri::command]
pub async fn delete_note(
    app: AppHandle,
    storage: State<'_, NotesStorage>,
    settings: State<'_, SettingsStore>,
    id: String,
) -> Result<(), String> {
    // Close the window if it exists
    if let Some(window) = app.get_webview_window(&format!("note-{}", id)) {
        let _ = window.close();
    }
    storage.delete_note(&id)?;
    mirror_delete(&settings, &id);
    Ok(())
}

#[tauri::command]
pub async fn clear_note(
    storage: State<'_, NotesStorage>,
    settings: State<'_, SettingsStore>,
    id: String,
) -> Result<Note, String> {
    if let Some(mut note) = storage.get_note(&id)? {
        note.content = String::new();
        note.updated_at = chrono::Utc::now().timestamp();
        let saved = storage.update_note(note)?;
        mirror_note(&settings, &saved);
        Ok(saved)
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
    // Close the window FIRST so it disappears instantly — don't make the user wait on the
    // disk write. Persisting the hidden flag happens right after.
    if let Some(window) = app.get_webview_window(&format!("note-{}", id)) {
        let _ = window.close();
    }

    if let Some(mut note) = storage.get_note(&id)? {
        note.is_visible = false;
        storage.update_note(note)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_pin_note(
    storage: State<'_, NotesStorage>,
    settings: State<'_, SettingsStore>,
    id: String,
) -> Result<Note, String> {
    if let Some(mut note) = storage.get_note(&id)? {
        note.is_pinned = !note.is_pinned;
        note.updated_at = chrono::Utc::now().timestamp();
        let saved = storage.update_note(note)?;
        mirror_note(&settings, &saved);
        Ok(saved)
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

// ===== Obsidian two-way sync =====

/// Connect (or change) the Obsidian vault folder that notes are synced with. Persists
/// the path, runs a full bidirectional reconcile immediately, and returns the number
/// of notes now in storage. After this, the background thread (see lib.rs) keeps the
/// two in sync. See OBSIDIAN_INTEGRATION.md.
#[tauri::command]
pub async fn set_obsidian_vault(
    storage: State<'_, NotesStorage>,
    settings: State<'_, SettingsStore>,
    dir: String,
) -> Result<usize, String> {
    settings.set_vault_path(Some(dir.clone()))?;
    crate::sync::sync_once(&storage, std::path::Path::new(&dir));
    Ok(storage.get_all_notes()?.len())
}

/// Stop syncing with the vault (leaves the `.md` files in place).
#[tauri::command]
pub async fn disconnect_obsidian(settings: State<'_, SettingsStore>) -> Result<(), String> {
    settings.set_vault_path(None)
}

/// The currently connected vault path, if any.
#[tauri::command]
pub async fn get_sync_status(settings: State<'_, SettingsStore>) -> Result<Option<String>, String> {
    Ok(settings.vault_path())
}

/// Run a manual bidirectional reconcile now. Returns true if storage changed.
#[tauri::command]
pub async fn sync_obsidian_now(
    storage: State<'_, NotesStorage>,
    settings: State<'_, SettingsStore>,
) -> Result<bool, String> {
    if let Some(vault) = settings.vault_path() {
        Ok(crate::sync::sync_once(&storage, std::path::Path::new(&vault)))
    } else {
        Ok(false)
    }
}

#[derive(serde::Serialize)]
pub struct TemplateDto {
    pub name: String,
    pub content: String,
}

/// Read user templates from a `Templates/` subfolder of the connected vault, so an
/// Obsidian user's own template `.md` files appear in Pin Notes. Returns an empty list
/// when no vault is connected or the folder doesn't exist. The `Templates/` subfolder is
/// ignored by the note sync (which only scans the top-level folder), so they never become notes.
#[tauri::command]
pub async fn get_vault_templates(
    settings: State<'_, SettingsStore>,
) -> Result<Vec<TemplateDto>, String> {
    let mut out = Vec::new();
    if let Some(vault) = settings.vault_path() {
        let dir = std::path::Path::new(&vault).join("Templates");
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("md") {
                    if let Ok(text) = std::fs::read_to_string(&path) {
                        let name = path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Template")
                            .to_string();
                        out.push(TemplateDto {
                            name,
                            content: crate::sync::template_body(&text),
                        });
                    }
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}
