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
}
