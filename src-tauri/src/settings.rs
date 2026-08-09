use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Persisted app settings. Currently just the Obsidian vault folder that notes
/// are mirrored into for two-way sync. Stored next to notes.json.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Settings {
    /// Absolute path to the folder notes are synced with (an Obsidian vault or a
    /// subfolder of one). `None` means sync is off.
    pub vault_path: Option<String>,
    /// When enabled, dragging a note to a screen edge docks it there; leaving it
    /// alone auto-hides it to a thin reveal strip (QQ-style edge docking).
    #[serde(default)]
    pub edge_dock_enabled: bool,
    /// Launch Pin Notes automatically when the user signs in to Windows.
    #[serde(default)]
    pub auto_start: bool,
    /// UI language: "zh" or "en". Kept in settings.json so tray labels and
    /// window titles created by Rust can match the frontend on every launch.
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_language() -> String {
    "en".to_string()
}

pub struct SettingsStore {
    pub data: Mutex<Settings>,
    pub file_path: PathBuf,
}

impl SettingsStore {
    pub fn new() -> Self {
        let file_path = Self::path();
        let data = Self::load(&file_path);
        Self {
            data: Mutex::new(data),
            file_path,
        }
    }

    fn path() -> PathBuf {
        if let Some(proj) = ProjectDirs::from("com", "pinnotes", "Pin Notes") {
            let dir = proj.data_dir();
            fs::create_dir_all(dir).ok();
            dir.join("settings.json")
        } else {
            PathBuf::from("settings.json")
        }
    }

    fn load(path: &PathBuf) -> Settings {
        fs::read_to_string(path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default()
    }

    fn save(&self) -> Result<(), String> {
        let data = self.data.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&*data).map_err(|e| e.to_string())?;
        fs::write(&self.file_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn vault_path(&self) -> Option<String> {
        self.data.lock().ok().and_then(|d| d.vault_path.clone())
    }

    pub fn set_vault_path(&self, path: Option<String>) -> Result<(), String> {
        {
            let mut data = self.data.lock().map_err(|e| e.to_string())?;
            data.vault_path = path;
        }
        self.save()
    }

    pub fn snapshot(&self) -> Result<Settings, String> {
        self.data.lock().map(|d| d.clone()).map_err(|e| e.to_string())
    }

    pub fn edge_dock_enabled(&self) -> bool {
        self.data.lock().map(|d| d.edge_dock_enabled).unwrap_or(false)
    }

    pub fn set_edge_dock_enabled(&self, enabled: bool) -> Result<(), String> {
        {
            let mut data = self.data.lock().map_err(|e| e.to_string())?;
            data.edge_dock_enabled = enabled;
        }
        self.save()
    }

    pub fn auto_start(&self) -> bool {
        self.data.lock().map(|d| d.auto_start).unwrap_or(false)
    }

    pub fn set_auto_start(&self, enabled: bool) -> Result<(), String> {
        {
            let mut data = self.data.lock().map_err(|e| e.to_string())?;
            data.auto_start = enabled;
        }
        self.save()
    }

    pub fn language(&self) -> String {
        let lang = self
            .data
            .lock()
            .map(|d| d.language.clone())
            .unwrap_or_else(|_| "zh".to_string());
        if lang == "en" {
            "en".to_string()
        } else {
            "zh".to_string()
        }
    }

    pub fn set_language(&self, language: String) -> Result<(), String> {
        if language != "zh" && language != "en" {
            return Err("Unsupported language".to_string());
        }
        {
            let mut data = self.data.lock().map_err(|e| e.to_string())?;
            data.language = language;
        }
        self.save()
    }
}
