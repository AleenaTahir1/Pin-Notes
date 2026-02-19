use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Note {
    pub id: String,
    pub content: String,
    pub color: String,
    pub position_x: i32,
    pub position_y: i32,
    pub width: u32,
    pub height: u32,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_visible: bool,
    #[serde(default)]
    pub is_pinned: bool,
}

impl Note {
    pub fn new(id: String, color: String, position_x: i32, position_y: i32) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id,
            content: String::new(),
            color,
            position_x,
            position_y,
            width: 280,
            height: 320,
            created_at: now,
            updated_at: now,
            is_visible: true,
            is_pinned: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct NotesData {
    pub notes: Vec<Note>,
}

pub struct NotesStorage {
    pub data: Mutex<NotesData>,
    pub file_path: PathBuf,
}

impl NotesStorage {
    pub fn new() -> Self {
        let file_path = Self::get_storage_path();
        let data = Self::load_from_file(&file_path);
        
        Self {
            data: Mutex::new(data),
            file_path,
        }
    }

    fn get_storage_path() -> PathBuf {
        if let Some(proj_dirs) = ProjectDirs::from("com", "pinnotes", "Pin Notes") {
            let data_dir = proj_dirs.data_dir();
            fs::create_dir_all(data_dir).ok();
            data_dir.join("notes.json")
        } else {
            PathBuf::from("notes.json")
        }
    }

    fn load_from_file(path: &PathBuf) -> NotesData {
        if path.exists() {
            match fs::read_to_string(path) {
                Ok(content) => {
                    serde_json::from_str(&content).unwrap_or_default()
                }
                Err(_) => NotesData::default(),
            }
        } else {
            NotesData::default()
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let data = self.data.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string_pretty(&*data).map_err(|e| e.to_string())?;
        fs::write(&self.file_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn create_note(&self, note: Note) -> Result<Note, String> {
        let mut data = self.data.lock().map_err(|e| e.to_string())?;
        data.notes.push(note.clone());
        drop(data);
        self.save()?;
        Ok(note)
    }

    pub fn update_note(&self, updated_note: Note) -> Result<Note, String> {
        let mut data = self.data.lock().map_err(|e| e.to_string())?;
        if let Some(note) = data.notes.iter_mut().find(|n| n.id == updated_note.id) {
            *note = updated_note.clone();
        }
        drop(data);
        self.save()?;
        Ok(updated_note)
    }

    pub fn delete_note(&self, id: &str) -> Result<(), String> {
        let mut data = self.data.lock().map_err(|e| e.to_string())?;
        data.notes.retain(|n| n.id != id);
        drop(data);
        self.save()?;
        Ok(())
    }

    pub fn get_all_notes(&self) -> Result<Vec<Note>, String> {
        let data = self.data.lock().map_err(|e| e.to_string())?;
        Ok(data.notes.clone())
    }

    pub fn get_note(&self, id: &str) -> Result<Option<Note>, String> {
        let data = self.data.lock().map_err(|e| e.to_string())?;
        Ok(data.notes.iter().find(|n| n.id == id).cloned())
    }
}
