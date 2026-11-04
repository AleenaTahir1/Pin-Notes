use crate::settings::SettingsStore;
use crate::storage::{Note, NotesStorage};
use crate::window::{create_notes_list_window, note_label, show_note, spawn_new_note};
use tauri::{AppHandle, Manager, State};

/// If a vault is connected, remove the `.md` file for a deleted note.
fn mirror_delete(settings: &SettingsStore, id: &str) {
    if let Some(vault) = settings.vault_path() {
        crate::sync::delete_note_file(std::path::Path::new(&vault), id);
    }
}

/// Create a note (optionally from a template) where the mouse is and open it.
#[tauri::command]
pub async fn create_note(app: AppHandle, content: Option<String>) -> Result<Note, String> {
    spawn_new_note(&app, content)
}

/// Save edits from a note window. Memory only; the background writer persists it and
/// mirrors it to Obsidian, so typing never waits on the disk.
#[tauri::command]
pub async fn update_note(storage: State<'_, NotesStorage>, note: Note) -> Result<Note, String> {
    storage.update_note(note)
}

#[tauri::command]
pub async fn delete_note(
    app: AppHandle,
    storage: State<'_, NotesStorage>,
    settings: State<'_, SettingsStore>,
    id: String,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&note_label(&id)) {
        let _ = window.close();
    }
    storage.delete_note(&id)?;
    mirror_delete(&settings, &id);
    Ok(())
}

#[tauri::command]
pub async fn open_note(app: AppHandle, id: String) -> Result<(), String> {
    show_note(&app, &id, true)
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

/// Close a note window (it stays in the list and can be reopened).
#[tauri::command]
pub async fn close_note(app: AppHandle, storage: State<'_, NotesStorage>, id: String) -> Result<(), String> {
    storage.update_note_with(&id, false, |n| n.is_visible = false)?;
    if let Some(window) = app.get_webview_window(&note_label(&id)) {
        let _ = window.close();
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_pin_note(storage: State<'_, NotesStorage>, id: String) -> Result<Note, String> {
    storage
        .update_note_with(&id, true, |n| n.is_pinned = !n.is_pinned)?
        .ok_or_else(|| "Note not found".to_string())
}

/// Keep a note above other windows, or let it sit behind them like a normal window.
#[tauri::command]
pub async fn set_note_on_top(
    app: AppHandle,
    storage: State<'_, NotesStorage>,
    id: String,
    on_top: bool,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&note_label(&id)) {
        window.set_always_on_top(on_top).map_err(|e| e.to_string())?;
    }
    storage.update_note_with(&id, false, |n| n.always_on_top = on_top)?;
    Ok(())
}

#[tauri::command]
pub async fn show_all_notes(app: AppHandle) -> Result<(), String> {
    crate::window::show_all_notes(&app)
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
    out.sort_by_key(|t| t.name.to_lowercase());
    Ok(out)
}
