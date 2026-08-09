use crate::storage::Note;
use crate::settings::SettingsStore;
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

    let settings = app.state::<SettingsStore>();
    let lang = settings.language();
    let window = WebviewWindowBuilder::new(app, &window_label, url)
        .title(crate::i18n::window_title(&lang, true))
        .inner_size(note.width as f64, note.height as f64)
        // Keep notes freeform: allow shrinking down to a thin one-line note (titlebar +
        // a line). Just enough of a floor that the window can't collapse to nothing.
        .min_inner_size(90.0, 72.0)
        .position(note.position_x as f64, note.position_y as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(true)
        // Start hidden — the frontend reveals the window once the note has painted, so it
        // opens smoothly instead of flashing an empty transparent window first.
        .visible(false)
        .icon(app_icon()?)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    // The frontend reveals the window as soon as the note paints (smooth open). This is a
    // safety net so the window can never get stuck hidden if that signal is missed.
    let fallback = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        if !fallback.is_visible().unwrap_or(true) {
            let _ = fallback.show();
            let _ = fallback.set_focus();
        }
    });

    Ok(())
}

/// Force a window to the front of the always-on-top band (Windows sometimes leaves a
/// re-shown window behind other topmost windows until the flag is re-applied).
fn bring_to_front(window: &tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_always_on_top(false);
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();
}

pub fn create_notes_list_window(app: &AppHandle) -> Result<(), String> {
    let window_label = "notes-list";

    // If already open, bring it back to the front. On Windows 10 the list could open or
    // stay behind the always-on-top note windows; bring_to_front re-asserts topmost so
    // "All notes" always surfaces the list.
    if let Some(window) = app.get_webview_window(window_label) {
        bring_to_front(&window);
        return Ok(());
    }

    let url = WebviewUrl::App("index.html?view=list".into());

    let settings = app.state::<SettingsStore>();
    let lang = settings.language();
    let window = WebviewWindowBuilder::new(app, window_label, url)
        .title(crate::i18n::window_title(&lang, false))
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

    bring_to_front(&window);

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
