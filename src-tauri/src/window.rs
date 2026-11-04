use crate::settings::SettingsStore;
use crate::storage::{Note, NotesStorage};
use tauri::image::Image;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

const APP_ICON: &[u8] = include_bytes!("../icons/icon.png");

fn app_icon() -> Result<Image<'static>, String> {
    Image::from_bytes(APP_ICON).map_err(|e| e.to_string())
}

pub fn note_label(id: &str) -> String {
    format!("note-{}", id)
}

/// Remember where the user drags a note (logical px, so it survives DPI changes).
/// Only memory is touched here; the background writer persists it.
fn track_position(window: &WebviewWindow, app: &AppHandle, id: String) {
    let win = window.clone();
    let app = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Moved(pos) = event {
            // Minimized windows on Windows report (-32000, -32000); ignore those.
            if pos.x <= -30000
                || pos.y <= -30000
                || win.is_minimized().unwrap_or(false)
                || crate::edge_dock::is_docked_hidden(&app, &id)
            {
                return;
            }
            let scale = win.scale_factor().unwrap_or(1.0);
            let logical = pos.to_logical::<f64>(scale);
            let storage = app.state::<NotesStorage>();
            let _ = storage.update_note_with(&id, false, |n| {
                n.position_x = logical.x.round() as i32;
                n.position_y = logical.y.round() as i32;
            });
        }
    });
}

/// If a saved position is no longer on any screen (monitor unplugged, resolution
/// changed), bring the note back onto the primary screen.
fn ensure_on_screen(window: &WebviewWindow) {
    let (Ok(pos), Ok(monitors)) = (window.outer_position(), window.available_monitors()) else {
        return;
    };
    // The top-left 40px of the note (its titlebar) must be grabbable on some monitor.
    let visible = monitors.iter().any(|m| {
        let (mp, ms) = (m.position(), m.size());
        pos.x + 40 > mp.x
            && pos.x < mp.x + ms.width as i32 - 40
            && pos.y >= mp.y - 10
            && pos.y < mp.y + ms.height as i32 - 40
    });
    if !visible {
        if let Ok(Some(primary)) = window.primary_monitor() {
            let p = primary.position();
            let _ = window.set_position(PhysicalPosition::new(p.x + 200, p.y + 200));
        }
    }
}

/// `focus`: take keyboard focus when shown. True for notes the user just created or
/// opened; false for notes restored at startup, so typing elsewhere isn't hijacked.
pub fn create_note_window(app: &AppHandle, note: &Note, focus: bool) -> Result<(), String> {
    let window_label = note_label(&note.id);

    // Check if window already exists
    if app.get_webview_window(&window_label).is_some() {
        return Ok(());
    }

    let query = if focus { "&focus=1" } else { "" };
    let url = WebviewUrl::App(format!("index.html?noteId={}{}", note.id, query).into());

    let settings = app.state::<SettingsStore>();
    let lang = settings.language();
    let window = WebviewWindowBuilder::new(app, &window_label, url)
        .title(crate::i18n::window_title(&lang, true))
        .focused(focus)
        .inner_size(note.width as f64, note.height as f64)
        // Keep notes freeform: allow shrinking down to a thin one-line note (titlebar +
        // a line). Just enough of a floor that the window can't collapse to nothing.
        .min_inner_size(90.0, 72.0)
        .position(note.position_x as f64, note.position_y as f64)
        .decorations(false)
        .transparent(true)
        .always_on_top(note.always_on_top)
        // Notes live in the tray, not the taskbar (one button per note was issue #1).
        .skip_taskbar(true)
        .resizable(true)
        // Start hidden — the frontend reveals the window once the note has painted, so it
        // opens smoothly instead of flashing an empty transparent window first.
        .visible(false)
        .icon(app_icon()?)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    ensure_on_screen(&window);
    track_position(&window, app, note.id.clone());

    // The frontend reveals the window as soon as the note paints (smooth open). This is a
    // safety net so the window can never get stuck hidden if that signal is missed.
    let fallback = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        if !fallback.is_visible().unwrap_or(true) {
            let _ = fallback.show();
            if focus {
                let _ = fallback.set_focus();
            }
        }
    });

    Ok(())
}

/// Force a window to the front of the always-on-top band (Windows sometimes leaves a
/// re-shown window behind other topmost windows until the flag is re-applied).
fn bring_to_front(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_always_on_top(false);
    let _ = window.set_always_on_top(true);
    let _ = window.set_focus();
}

/// Show a note: reveal its window if it is hidden ("minimized" notes are hidden, since
/// they have no taskbar button) or open a new one.
pub fn show_note(app: &AppHandle, id: &str, focus: bool) -> Result<(), String> {
    let storage = app.state::<NotesStorage>();
    if let Some(window) = app.get_webview_window(&note_label(id)) {
        let _ = window.unminimize();
        let _ = window.show();
        if focus {
            let _ = window.set_focus();
        }
    } else if let Some(note) = storage.get_note(id)? {
        create_note_window(app, &note, focus)?;
    }
    storage.update_note_with(id, false, |n| n.is_visible = true)?;
    Ok(())
}

/// Bring every note back, including closed and hidden ones (tray "Show All Notes").
pub fn show_all_notes(app: &AppHandle) -> Result<(), String> {
    let notes = app.state::<NotesStorage>().get_all_notes()?;
    for note in notes {
        show_note(app, &note.id, false)?;
    }
    Ok(())
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

/// Where a new note should appear: just below-left of the mouse, kept fully on that
/// screen, and nudged diagonally if another visible note already sits right there.
pub fn spawn_position(app: &AppHandle) -> (i32, i32) {
    let (w, h) = (280.0, 320.0);
    let mut x = 200.0;
    let mut y = 200.0;
    if let Ok(cursor) = app.cursor_position() {
        if let Ok(Some(m)) = app.monitor_from_point(cursor.x, cursor.y) {
            let scale = m.scale_factor();
            let (mx, my) = (m.position().x as f64 / scale, m.position().y as f64 / scale);
            let (mw, mh) = (m.size().width as f64 / scale, m.size().height as f64 / scale);
            x = (cursor.x / scale - 40.0).clamp(mx + 8.0, (mx + mw - w - 8.0).max(mx));
            y = (cursor.y / scale - 20.0).clamp(my + 8.0, (my + mh - h - 48.0).max(my));
        }
    }
    let taken: Vec<(i32, i32)> = app
        .state::<NotesStorage>()
        .get_all_notes()
        .unwrap_or_default()
        .into_iter()
        .filter(|n| n.is_visible)
        .map(|n| (n.position_x, n.position_y))
        .collect();
    let (mut px, mut py) = (x.round() as i32, y.round() as i32);
    for _ in 0..12 {
        if !taken.iter().any(|&(tx, ty)| (tx - px).abs() < 12 && (ty - py).abs() < 12) {
            break;
        }
        px += 28;
        py += 28;
    }
    (px, py)
}

pub fn spawn_new_note(app: &AppHandle, content: Option<String>) -> Result<Note, String> {
    let (x, y) = spawn_position(app);
    let mut note = Note::new(uuid::Uuid::new_v4().to_string(), "#fff9c4".to_string(), x, y);
    if let Some(c) = content {
        note.content = c;
    }
    let saved = app.state::<NotesStorage>().create_note(note)?;
    create_note_window(app, &saved, true)?;
    Ok(saved)
}

pub fn restore_all_notes(app: &AppHandle) -> Result<(), String> {
    let storage = app.state::<NotesStorage>();
    let notes = storage.get_all_notes()?;

    for note in notes {
        if note.is_visible {
            create_note_window(app, &note, false)?;
        }
    }

    Ok(())
}
