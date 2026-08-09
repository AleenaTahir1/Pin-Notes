/// Small Rust-side string table used for tray menu labels and OS window titles.
/// The rich frontend strings live in `src/store/i18n.ts`; this only covers text
/// that Tauri creates before/outside the webview.
pub fn tray_text(lang: &str, key: &str) -> &'static str {
    let en = lang == "en";
    match key {
        "new_note" => {
            if en {
                "New Note"
            } else {
                "新建便笺"
            }
        }
        "notes_list" => {
            if en {
                "Notes List"
            } else {
                "便笺列表"
            }
        }
        "show_all" => {
            if en {
                "Show All Notes"
            } else {
                "显示所有便笺"
            }
        }
        "edge_dock" => {
            if en {
                "Edge Dock"
            } else {
                "贴边隐藏"
            }
        }
        "auto_start" => {
            if en {
                "Launch at Startup"
            } else {
                "开机自启"
            }
        }
        "quit" => {
            if en {
                "Quit"
            } else {
                "退出"
            }
        }
        _ => "",
    }
}

pub fn window_title(lang: &str, is_note: bool) -> &'static str {
    if lang == "en" {
        if is_note {
            "Pin Note"
        } else {
            "Pin Notes"
        }
    } else {
        "便笺"
    }
}
