use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::settings::SettingsStore;
use crate::window::{create_notes_list_window, spawn_new_note_at_cursor};

pub struct TrayMenuState {
    pub new_note_item: MenuItem<tauri::Wry>,
    pub notes_list_item: MenuItem<tauri::Wry>,
    pub show_all_item: MenuItem<tauri::Wry>,
    pub edge_dock_item: CheckMenuItem<tauri::Wry>,
    pub auto_start_item: CheckMenuItem<tauri::Wry>,
    pub lang_zh_item: CheckMenuItem<tauri::Wry>,
    pub lang_en_item: CheckMenuItem<tauri::Wry>,
    pub quit_item: MenuItem<tauri::Wry>,
}

#[derive(Clone, serde::Serialize)]
struct SettingsChangedPayload {
    edge_dock_enabled: bool,
    auto_start: bool,
}

#[derive(Clone, serde::Serialize)]
struct LanguageChangedPayload {
    language: String,
}

pub fn setup_tray(app: &AppHandle) -> Result<(), String> {
    let settings = app.state::<SettingsStore>();
    let lang = settings.language();
    let new_note = MenuItem::with_id(
        app,
        "new_note",
        crate::i18n::tray_text(&lang, "new_note"),
        true,
        Some("Ctrl+Alt+P"),
    )
    .map_err(|e| e.to_string())?;
    let notes_list = MenuItem::with_id(
        app,
        "notes_list",
        crate::i18n::tray_text(&lang, "notes_list"),
        true,
        Some("Ctrl+Alt+L"),
    )
    .map_err(|e| e.to_string())?;
    let show_all = MenuItem::with_id(
        app,
        "show_all",
        crate::i18n::tray_text(&lang, "show_all"),
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let edge_dock = CheckMenuItem::with_id(
        app,
        "edge_dock",
        crate::i18n::tray_text(&lang, "edge_dock"),
        true,
        false,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    let auto_start =
        CheckMenuItem::with_id(
            app,
            "auto_start",
            crate::i18n::tray_text(&lang, "auto_start"),
            true,
            false,
            None::<&str>,
        )
        .map_err(|e| e.to_string())?;
    let lang_zh = CheckMenuItem::with_id(app, "lang_zh", "中文", true, lang == "zh", None::<&str>)
        .map_err(|e| e.to_string())?;
    let lang_en =
        CheckMenuItem::with_id(app, "lang_en", "English", true, lang == "en", None::<&str>)
            .map_err(|e| e.to_string())?;
    let separator = MenuItem::with_id(app, "separator", "───────────", false, None::<&str>)
        .map_err(|e| e.to_string())?;
    let language_separator =
        MenuItem::with_id(app, "language_separator", "───────────", false, None::<&str>)
            .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        crate::i18n::tray_text(&lang, "quit"),
        true,
        Some("Alt+F4"),
    )
    .map_err(|e| e.to_string())?;

    let settings = app.state::<SettingsStore>();
    edge_dock
        .set_checked(settings.edge_dock_enabled())
        .map_err(|e| e.to_string())?;
    auto_start
        .set_checked(settings.auto_start())
        .map_err(|e| e.to_string())?;

    let menu = Menu::with_items(
        app,
        &[
            &new_note,
            &notes_list,
            &show_all,
            &separator,
            &edge_dock,
            &auto_start,
            &language_separator,
            &lang_zh,
            &lang_en,
            &quit,
        ],
    )
    .map_err(|e| e.to_string())?;

    app.manage(TrayMenuState {
        new_note_item: new_note,
        notes_list_item: notes_list,
        show_all_item: show_all,
        edge_dock_item: edge_dock,
        auto_start_item: auto_start,
        lang_zh_item: lang_zh,
        lang_en_item: lang_en,
        quit_item: quit,
    });

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
            "edge_dock" => {
                let settings = app.state::<SettingsStore>();
                let state = app.state::<TrayMenuState>();
                let next = !settings.edge_dock_enabled();
                if settings.set_edge_dock_enabled(next).is_ok() {
                    let _ = state.edge_dock_item.set_checked(next);
                }
                let payload = SettingsChangedPayload {
                    edge_dock_enabled: next,
                    auto_start: settings.auto_start(),
                };
                let _ = app.emit("settings-changed", payload);
            }
            "auto_start" => {
                use tauri_plugin_autostart::ManagerExt;
                let settings = app.state::<SettingsStore>();
                let state = app.state::<TrayMenuState>();
                let next = !settings.auto_start();
                let manager = app.autolaunch();
                let result = if next { manager.enable() } else { manager.disable() };
                if let Err(e) = result {
                    eprintln!("Failed to toggle auto start: {}", e);
                } else if settings.set_auto_start(next).is_ok() {
                    let _ = state.auto_start_item.set_checked(next);
                }
                let payload = SettingsChangedPayload {
                    edge_dock_enabled: settings.edge_dock_enabled(),
                    auto_start: next,
                };
                let _ = app.emit("settings-changed", payload);
            }
            "lang_zh" => {
                if let Err(e) = set_app_language(app, "zh".to_string()) {
                    eprintln!("Failed to switch language: {}", e);
                }
            }
            "lang_en" => {
                if let Err(e) = set_app_language(app, "en".to_string()) {
                    eprintln!("Failed to switch language: {}", e);
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

pub fn update_tray_language(app: &AppHandle, lang: &str) -> Result<(), String> {
    let state = app.state::<TrayMenuState>();
    state
        .new_note_item
        .set_text(crate::i18n::tray_text(lang, "new_note"))
        .map_err(|e| e.to_string())?;
    state
        .notes_list_item
        .set_text(crate::i18n::tray_text(lang, "notes_list"))
        .map_err(|e| e.to_string())?;
    state
        .show_all_item
        .set_text(crate::i18n::tray_text(lang, "show_all"))
        .map_err(|e| e.to_string())?;
    state
        .edge_dock_item
        .set_text(crate::i18n::tray_text(lang, "edge_dock"))
        .map_err(|e| e.to_string())?;
    state
        .auto_start_item
        .set_text(crate::i18n::tray_text(lang, "auto_start"))
        .map_err(|e| e.to_string())?;
    state
        .quit_item
        .set_text(crate::i18n::tray_text(lang, "quit"))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn update_tray_language_checks(app: &AppHandle, lang: &str) -> Result<(), String> {
    let state = app.state::<TrayMenuState>();
    state
        .lang_zh_item
        .set_checked(lang != "en")
        .map_err(|e| e.to_string())?;
    state
        .lang_en_item
        .set_checked(lang == "en")
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Persist a language choice and update every native surface: tray labels,
/// tray check marks, OS window titles, and the webviews (via `language-changed`).
pub fn set_app_language(app: &AppHandle, language: String) -> Result<(), String> {
    let settings = app.state::<SettingsStore>();
    settings.set_language(language.clone())?;
    update_tray_language(app, &language)?;
    update_tray_language_checks(app, &language)?;

    for (label, window) in app.webview_windows() {
        let title = crate::i18n::window_title(&language, label.starts_with("note-"));
        let _ = window.set_title(title);
    }

    let _ = app.emit(
        "language-changed",
        LanguageChangedPayload {
            language: language.clone(),
        },
    );
    Ok(())
}
