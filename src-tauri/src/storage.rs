use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

fn default_true() -> bool {
    true
}

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
    /// Remembered font family for this note (CSS value). Empty = app default.
    #[serde(default)]
    pub font: String,
    /// Remembered text size in px for this note. 0 = app default.
    #[serde(default)]
    pub font_size: u32,
    /// Float above other windows (the default) or behave like a normal window.
    #[serde(default = "default_true")]
    pub always_on_top: bool,
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
            font: String::new(),
            font_size: 0,
            always_on_top: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct NotesData {
    pub notes: Vec<Note>,
}

/// Where notes.json and settings.json live. `PIN_NOTES_DATA_DIR` overrides it so a
/// dev/test run never touches the real notes.
pub fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("PIN_NOTES_DATA_DIR") {
        let dir = PathBuf::from(dir);
        fs::create_dir_all(&dir).ok();
        return dir;
    }
    if let Some(proj_dirs) = ProjectDirs::from("com", "pinnotes", "Pin Notes") {
        let dir = proj_dirs.data_dir().to_path_buf();
        fs::create_dir_all(&dir).ok();
        dir
    } else {
        PathBuf::from(".")
    }
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    path.with_file_name(name)
}

/// Replace `path` without ever leaving a half-written file behind: write a temp file,
/// flush it to disk, keep the previous version as `.bak`, then swap the new one in.
/// If the process dies part way, either the old file or the `.bak` is still whole.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = sibling(path, ".tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    if path.exists() {
        fs::rename(path, sibling(path, ".bak"))?;
    }
    fs::rename(&tmp, path)
}

/// Read a JSON file written by `write_atomic`. A damaged file is moved aside (never
/// overwritten) and the `.bak` copy is used instead.
pub fn read_json_with_backup<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    let parse = |p: &Path| -> Option<T> { serde_json::from_str(&fs::read_to_string(p).ok()?).ok() };
    if path.exists() {
        if let Some(v) = parse(path) {
            return v;
        }
        let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
        let aside = sibling(path, &format!(".corrupt-{}", stamp));
        eprintln!("[Pin Notes] {} is damaged; kept as {}", path.display(), aside.display());
        let _ = fs::rename(path, &aside);
    }
    parse(&sibling(path, ".bak")).unwrap_or_default()
}

pub struct NotesStorage {
    pub data: Mutex<NotesData>,
    pub file_path: PathBuf,
    /// Set by every change; the background writer flushes to disk when it sees it.
    dirty: AtomicBool,
    /// Notes whose text/metadata changed and should be mirrored to the Obsidian vault.
    changed_ids: Mutex<HashSet<String>>,
    /// One writer at a time (the background flusher and the exit flush can race).
    write_lock: Mutex<()>,
}

impl NotesStorage {
    pub fn new() -> Self {
        Self::at(data_dir().join("notes.json"))
    }

    pub fn at(file_path: PathBuf) -> Self {
        let data = read_json_with_backup(&file_path);
        Self {
            data: Mutex::new(data),
            file_path,
            dirty: AtomicBool::new(false),
            changed_ids: Mutex::new(HashSet::new()),
            write_lock: Mutex::new(()),
        }
    }

    fn mark(&self, id: Option<&str>) {
        if let (Some(id), Ok(mut ids)) = (id, self.changed_ids.lock()) {
            ids.insert(id.to_string());
        }
        self.dirty.store(true, Ordering::SeqCst);
    }

    /// Write to disk now if anything changed. Called by the background writer every few
    /// hundred ms and once more on exit, so typing never waits on the disk.
    pub fn flush(&self) -> Result<bool, String> {
        let _guard = self.write_lock.lock().map_err(|e| e.to_string())?;
        if !self.dirty.swap(false, Ordering::SeqCst) {
            return Ok(false);
        }
        let json = {
            let data = self.data.lock().map_err(|e| e.to_string())?;
            serde_json::to_string_pretty(&*data).map_err(|e| e.to_string())?
        };
        if let Err(e) = write_atomic(&self.file_path, json.as_bytes()) {
            self.dirty.store(true, Ordering::SeqCst); // retry on the next tick
            return Err(e.to_string());
        }
        Ok(true)
    }

    /// Ids changed since the last call (for the vault mirror).
    pub fn take_changed_ids(&self) -> Vec<String> {
        self.changed_ids
            .lock()
            .map(|mut ids| ids.drain().collect())
            .unwrap_or_default()
    }

    pub fn create_note(&self, note: Note) -> Result<Note, String> {
        let mut data = self.data.lock().map_err(|e| e.to_string())?;
        data.notes.push(note.clone());
        drop(data);
        self.mark(Some(&note.id));
        Ok(note)
    }

    /// Save edits coming from a note window. Only the fields the window owns are taken;
    /// position, visibility, pin and on-top are managed by the app, so a stale copy
    /// from the window can't undo them.
    pub fn update_note(&self, edited: Note) -> Result<Note, String> {
        self.update_note_with(&edited.id, true, |n| {
            n.content = edited.content.clone();
            n.color = edited.color.clone();
            n.font = edited.font.clone();
            n.font_size = edited.font_size;
            n.width = edited.width;
            n.height = edited.height;
        })?
        .ok_or_else(|| "Note not found".to_string())
    }

    /// Change one note in place. `touch` bumps `updated_at` and queues an Obsidian mirror
    /// (content edits); window moves and show/hide pass false.
    pub fn update_note_with(
        &self,
        id: &str,
        touch: bool,
        f: impl FnOnce(&mut Note),
    ) -> Result<Option<Note>, String> {
        let mut data = self.data.lock().map_err(|e| e.to_string())?;
        let Some(note) = data.notes.iter_mut().find(|n| n.id == id) else {
            return Ok(None);
        };
        f(note);
        if touch {
            note.updated_at = chrono::Utc::now().timestamp();
        }
        let out = note.clone();
        drop(data);
        self.mark(if touch { Some(id) } else { None });
        Ok(Some(out))
    }

    pub fn delete_note(&self, id: &str) -> Result<(), String> {
        let mut data = self.data.lock().map_err(|e| e.to_string())?;
        data.notes.retain(|n| n.id != id);
        drop(data);
        self.mark(None);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pinnotes-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("notes.json")
    }

    const GOOD: &str = r##"{"notes":[{"id":"keep","content":"precious","color":"#fff","position_x":0,"position_y":0,"width":1,"height":1,"created_at":0,"updated_at":0,"is_visible":true}]}"##;

    #[test]
    fn create_update_delete_persist() {
        let p = tmp("crud");
        let s = NotesStorage::at(p.clone());
        let mut n = Note::new("a".into(), "#fff".into(), 1, 2);
        s.create_note(n.clone()).unwrap();
        n.content = "hello\nworld".into();
        s.update_note(n.clone()).unwrap();
        s.flush().unwrap();
        let reloaded = NotesStorage::at(p.clone());
        assert_eq!(reloaded.get_note("a").unwrap().unwrap().content, "hello\nworld");
        reloaded.delete_note("a").unwrap();
        reloaded.flush().unwrap();
        assert!(NotesStorage::at(p).get_all_notes().unwrap().is_empty());
    }

    #[test]
    fn nothing_is_written_until_flush_and_flush_is_idempotent() {
        let p = tmp("flush");
        let s = NotesStorage::at(p.clone());
        s.create_note(Note::new("a".into(), "#fff".into(), 0, 0)).unwrap();
        assert!(!p.exists());
        assert!(s.flush().unwrap());
        assert!(!s.flush().unwrap());
        assert!(p.exists());
    }

    #[test]
    fn window_edits_cannot_undo_app_managed_fields() {
        let p = tmp("owned");
        let s = NotesStorage::at(p);
        let stale = Note::new("a".into(), "#fff".into(), 10, 10);
        s.create_note(stale.clone()).unwrap();
        s.update_note_with("a", false, |n| {
            n.position_x = 500;
            n.is_visible = false;
            n.is_pinned = true;
            n.always_on_top = false;
        })
        .unwrap();
        let mut edit = stale;
        edit.content = "typed".into();
        let saved = s.update_note(edit).unwrap();
        assert_eq!(saved.content, "typed");
        assert_eq!(saved.position_x, 500);
        assert!(!saved.is_visible);
        assert!(saved.is_pinned);
        assert!(!saved.always_on_top);
    }

    #[test]
    fn old_files_without_new_fields_still_load() {
        let p = tmp("compat");
        fs::write(&p, GOOD).unwrap();
        let n = NotesStorage::at(p).get_note("keep").unwrap().unwrap();
        assert!(n.always_on_top);
    }

    #[test]
    fn large_note_round_trips() {
        let p = tmp("large");
        let s = NotesStorage::at(p.clone());
        let mut n = Note::new("big".into(), "#fff".into(), 0, 0);
        n.content = "line with unicode café 😀\n".repeat(50_000);
        s.create_note(n.clone()).unwrap();
        s.flush().unwrap();
        assert_eq!(NotesStorage::at(p).get_note("big").unwrap().unwrap().content, n.content);
    }

    /// A damaged notes.json (power cut mid-write) must never cost the user their notes.
    #[test]
    fn corrupt_file_falls_back_to_backup_and_is_kept() {
        let p = tmp("corrupt");
        fs::write(sibling(&p, ".bak"), GOOD).unwrap();
        fs::write(&p, &GOOD[..GOOD.len() / 2]).unwrap();
        let s = NotesStorage::at(p.clone());
        assert_eq!(s.get_note("keep").unwrap().unwrap().content, "precious");
        let kept = fs::read_dir(p.parent().unwrap())
            .unwrap()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().contains(".corrupt-"));
        assert!(kept, "damaged file should be kept aside, not deleted");
    }

    #[test]
    fn crash_between_renames_recovers_from_backup() {
        let p = tmp("midswap");
        // notes.json was renamed to .bak, but the new file never landed.
        fs::write(sibling(&p, ".bak"), GOOD).unwrap();
        assert_eq!(NotesStorage::at(p).get_all_notes().unwrap().len(), 1);
    }

    #[test]
    fn every_save_keeps_the_previous_version() {
        let p = tmp("bak");
        let s = NotesStorage::at(p.clone());
        s.create_note(Note::new("a".into(), "#fff".into(), 0, 0)).unwrap();
        s.flush().unwrap();
        s.create_note(Note::new("b".into(), "#fff".into(), 0, 0)).unwrap();
        s.flush().unwrap();
        let bak = fs::read_to_string(sibling(&p, ".bak")).unwrap();
        assert!(bak.contains("\"a\"") && !bak.contains("\"b\""));
        assert!(!sibling(&p, ".tmp").exists());
    }
}
