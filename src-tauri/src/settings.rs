use crate::storage::{data_dir, read_json_with_backup, write_atomic};
use serde::{Deserialize, Serialize};
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
        let file_path = data_dir().join("settings.json");
        let data = read_json_with_backup(&file_path);
        Self {
            data: Mutex::new(data),
            file_path,
        }
    }

    fn save(&self) -> Result<(), String> {
        let json = {
            let data = self.data.lock().map_err(|e| e.to_string())?;
            serde_json::to_string_pretty(&*data).map_err(|e| e.to_string())?
        };
        write_atomic(&self.file_path, json.as_bytes()).map_err(|e| e.to_string())
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
