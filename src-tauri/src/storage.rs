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

    /// Folder for pasted images, next to notes.json. Notes reference them as
    /// `![](images/<file>)`, the same relative path used in the Obsidian vault.
    pub fn images_dir(&self) -> PathBuf {
        self.file_path
            .parent()
            .map(|p| p.join("images"))
            .unwrap_or_else(|| PathBuf::from("images"))
    }

    /// Save a pasted image and return the path to put in the note.
    pub fn save_image(&self, bytes: &[u8], ext: &str) -> Result<String, String> {
        const MAX: usize = 25 * 1024 * 1024;
        if bytes.is_empty() || bytes.len() > MAX {
            return Err("Image is empty or larger than 25 MB".to_string());
        }
        let ext = ext.trim_start_matches('.').to_ascii_lowercase();
        let ext = match ext.as_str() {
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" => ext,
            _ => "png".to_string(),
        };
        let dir = self.images_dir();
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
        fs::write(dir.join(&name), bytes).map_err(|e| e.to_string())?;
        Ok(format!("images/{}", name))
    }

    /// Delete image files no note uses any more (e.g. a pasted image that was removed
    /// from its note). Only files older than `min_age` are touched, so an image that is
    /// being pasted right now is never caught.
    pub fn remove_orphan_images(&self, min_age: std::time::Duration) -> usize {
        let Ok(notes) = self.get_all_notes() else { return 0 };
        let Ok(entries) = fs::read_dir(self.images_dir()) else { return 0 };
        let mut removed = 0;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = format!("images/{}", name);
            let old_enough = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .is_some_and(|age| age >= min_age);
            if old_enough && !notes.iter().any(|n| n.content.contains(&path)) && fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
        removed
    }

    /// A pasted image as a `data:` URL, so it can travel inside copied HTML and
    /// exported web pages.
    pub fn image_data_url(&self, path: &str) -> Result<String, String> {
        use base64::Engine;
        let name = image_name(path).ok_or("Not an image path")?;
        let bytes = fs::read(self.images_dir().join(name)).map_err(|e| e.to_string())?;
        let mime = match name.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            _ => "image/png",
        };
        Ok(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(bytes)))
    }

    /// Write an exported note to `path`; with `images_folder`, also copy the note's
    /// pictures into that folder next to the file (for Markdown exports).
    pub fn export_note(&self, path: &Path, contents: &str, images_folder: Option<&str>, images: &[String]) -> Result<(), String> {
        fs::write(path, contents).map_err(|e| e.to_string())?;
        if let Some(folder) = images_folder.filter(|f| !f.is_empty() && !f.contains(['/', '\\']) && *f != "..") {
            let dir = path.parent().unwrap_or(Path::new(".")).join(folder);
            for img in images {
                if let Some(name) = image_name(img) {
                    let src = self.images_dir().join(name);
                    if src.exists() {
                        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                        fs::copy(&src, dir.join(name)).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        Ok(())
    }

    /// Delete the given images unless another note still uses them.
    pub fn remove_unused_images(&self, candidates: &[String]) {
        let Ok(notes) = self.get_all_notes() else { return };
        let dir = self.images_dir();
        for path in candidates {
            if notes.iter().any(|n| n.content.contains(path.as_str())) {
                continue;
            }
            if let Some(name) = path.strip_prefix("images/") {
                let _ = fs::remove_file(dir.join(name));
            }
        }
    }
}

/// The file name inside `images/` if `path` is a safe `images/<file>` path
/// (no folders, no `..`), else None.
pub fn image_name(path: &str) -> Option<&str> {
    let name = path.strip_prefix("images/")?;
    let ok = !name.is_empty()
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    ok.then_some(name)
}

/// `images/<file>` paths referenced by `![...](images/<file>)` in a note.
pub fn image_refs(content: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = content;
    while let Some(i) = rest.find("](images/") {
        let after = &rest[i + 2..];
        let end = after.find(')').unwrap_or(after.len());
        let path = &after[..end];
        if image_name(path).is_some() && !out.iter().any(|p: &String| p == path) {
            out.push(path.to_string());
        }
        rest = &after[end..];
    }
    out
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
    fn pasted_images_are_saved_found_and_cleaned_up() {
        let p = tmp("images");
        let s = NotesStorage::at(p.clone());
        let path = s.save_image(&[1, 2, 3], "PNG").unwrap();
        assert!(path.starts_with("images/") && path.ends_with(".png"));
        assert!(s.images_dir().join(&path["images/".len()..]).exists());
        let mut a = Note::new("a".into(), "#fff".into(), 0, 0);
        a.content = format!("shot ![]({})\nand ![x]({}) again", path, path);
        let mut b = Note::new("b".into(), "#fff".into(), 0, 0);
        b.content = format!("![]({})", path);
        s.create_note(a).unwrap();
        s.create_note(b).unwrap();
        assert_eq!(image_refs(&format!("![]({}) ![](images/../etc)", path)), vec![path.clone()]);
        // still used by b: kept
        s.delete_note("a").unwrap();
        s.remove_unused_images(std::slice::from_ref(&path));
        assert!(s.images_dir().join(&path["images/".len()..]).exists());
        // no one uses it any more: removed
        s.delete_note("b").unwrap();
        s.remove_unused_images(std::slice::from_ref(&path));
        assert!(!s.images_dir().join(&path["images/".len()..]).exists());
        assert!(s.save_image(&[], "png").is_err());
        assert!(s.save_image(&[1], "exe").unwrap().ends_with(".png"));
    }

    #[test]
    fn orphan_images_are_removed_but_used_and_new_ones_kept() {
        let p = tmp("orphans");
        let s = NotesStorage::at(p);
        let used = s.save_image(&[1], "png").unwrap();
        let orphan = s.save_image(&[2], "png").unwrap();
        let mut n = Note::new("a".into(), "#fff".into(), 0, 0);
        n.content = format!("![]({})", used);
        s.create_note(n).unwrap();
        // brand-new files are left alone
        assert_eq!(s.remove_orphan_images(std::time::Duration::from_secs(3600)), 0);
        assert_eq!(s.remove_orphan_images(std::time::Duration::ZERO), 1);
        assert!(s.images_dir().join(&used["images/".len()..]).exists());
        assert!(!s.images_dir().join(&orphan["images/".len()..]).exists());
    }

    #[test]
    fn export_writes_the_file_and_copies_pictures_safely() {
        let p = tmp("export");
        let s = NotesStorage::at(p.clone());
        let img = s.save_image(&[137, 80, 78, 71], "png").unwrap();
        assert!(s.image_data_url(&img).unwrap().starts_with("data:image/png;base64,iVBORw"));
        assert!(s.image_data_url("images/../notes.json").is_err());
        let out = p.parent().unwrap().join("My note.md");
        s.export_note(&out, "# Hi", Some("My-note-images"), &[img.clone(), "images/../x".into()]).unwrap();
        assert_eq!(fs::read_to_string(&out).unwrap(), "# Hi");
        assert!(p.parent().unwrap().join("My-note-images").join(&img["images/".len()..]).exists());
        // a folder name that tries to leave the export location is ignored
        s.export_note(&out, "x", Some("../evil"), std::slice::from_ref(&img)).unwrap();
        assert!(!p.parent().unwrap().parent().unwrap().join("evil").exists());
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
