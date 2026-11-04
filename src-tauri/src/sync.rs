// Two-way Obsidian sync.
//
// - Pin Notes -> Obsidian: every note is written as a standard Markdown file in the
//   vault folder, with YAML front-matter carrying the metadata. Colored highlights
//   (=={color}text==) are written as Obsidian's standard ==text==.
// - Obsidian -> Pin Notes: a background reconcile (see lib.rs) reads the vault and
//   pulls any externally-edited / newly-created files back into storage.
//
// Conflict handling is last-write-wins by timestamp. A note's body is only treated as
// "changed in Obsidian" when its text actually differs from what Pin Notes last wrote,
// so unchanged notes keep their original highlight colors and never churn. Any extra
// front-matter the user adds in Obsidian (tags, aliases, ...) is preserved on rewrite.

use crate::storage::{Note, NotesStorage};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const DEFAULT_COLOR: &str = "#fff9c4";

/// Front-matter keys this app owns and rewrites. Everything else is preserved verbatim.
const MANAGED_KEYS: [&str; 5] = ["pin_id", "color", "pinned", "created", "updated"];

struct Parsed {
    pin_id: Option<String>,
    color: Option<String>,
    pinned: bool,
    /// Front-matter lines that aren't ours (user's Obsidian properties) — kept as-is.
    extra_fm: Vec<String>,
    body: String,
}

fn fmt_date(ts: i64) -> String {
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| ts.to_string())
}

fn short_id(id: &str) -> &str {
    id.split('-').next().unwrap_or("note")
}

/// Pin Notes colored highlight markup `=={color}text==` -> Obsidian `==text==`.
pub fn to_obsidian_body(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut i = 0;
    while i < content.len() {
        let rest = &content[i..];
        if let Some(after) = rest.strip_prefix("=={") {
            if let Some(rel) = after.find('}') {
                let tag = &after[..rel];
                if !tag.is_empty() && tag.chars().all(|c| c.is_ascii_alphanumeric()) {
                    out.push_str("==");
                    i += 3 + rel + 1; // skip `=={tag}`
                    continue;
                }
            }
        }
        let ch = rest.chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

/// Obsidian `==text==` -> Pin Notes `=={yellow}text==` (color info is gone, so default).
/// Already-tagged `=={color}` openings are left untouched. Like the editor, a `==` only
/// opens a highlight when text follows it directly and a closing `==` (with text right
/// before it) exists on the same line, so `a == b` is left alone.
pub fn from_obsidian_body(md: &str) -> String {
    md.split('\n').map(highlight_line).collect::<Vec<_>>().join("\n")
}

fn highlight_line(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let is_run = |i: usize| i + 1 < chars.len() && chars[i] == '=' && chars[i + 1] == '=';
    // A lone "==" (not part of "===" or longer).
    let lone = |i: usize| is_run(i) && (i == 0 || chars[i - 1] != '=') && chars.get(i + 2) != Some(&'=');
    let mut out = String::with_capacity(line.len() + 16);
    let mut i = 0;
    while i < chars.len() {
        if lone(i) && chars.get(i + 2).is_some_and(|c| !c.is_whitespace()) {
            // Find the closing "==" with non-space text right before it.
            let close = (i + 3..chars.len()).find(|&j| lone(j) && !chars[j - 1].is_whitespace());
            if let Some(j) = close {
                out.push_str("==");
                if chars[i + 2] != '{' {
                    out.push_str("{yellow}");
                }
                out.extend(&chars[i + 2..j]);
                out.push_str("==");
                i = j + 2;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Turn a template `.md` file's text into Pin Notes note content: drop any
/// front-matter and convert Obsidian highlights (`==text==`) to internal markup.
pub fn template_body(file_text: &str) -> String {
    let parsed = parse_md(file_text);
    from_obsidian_body(parsed.body.trim_end())
}

fn sanitize_filename(title: &str) -> String {
    let s: String = title
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let s = s.trim().trim_matches('.').trim();
    if s.is_empty() {
        return "Untitled Note".to_string();
    }
    let s: String = s.chars().take(60).collect();
    // Windows can't create files named after devices (CON, NUL, COM1 ...).
    let stem = s.split('.').next().unwrap_or("").trim().to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        format!("{} note", s)
    } else {
        s
    }
}

fn note_title(content: &str) -> String {
    let line = content
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("Untitled Note");
    let cleaned: String = line
        .replace("==", " ")
        .chars()
        .filter(|c| !matches!(c, '#' | '*' | '_' | '~' | '`' | '{' | '}'))
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        "Untitled Note".to_string()
    } else {
        cleaned.to_string()
    }
}

fn parse_md(text: &str) -> Parsed {
    let mut pin_id = None;
    let mut color = None;
    let mut pinned = false;
    let mut extra_fm = Vec::new();
    let body;

    if let Some(rest) = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n")) {
        if let Some(end) = rest.find("\n---") {
            let fm = &rest[..end];
            for line in fm.lines() {
                let trimmed = line.trim_end();
                if let Some(v) = trimmed.strip_prefix("pin_id:") {
                    pin_id = Some(v.trim().to_string());
                } else if let Some(v) = trimmed.strip_prefix("color:") {
                    color = Some(v.trim().trim_matches('"').to_string());
                } else if let Some(v) = trimmed.strip_prefix("pinned:") {
                    pinned = v.trim() == "true";
                } else if !MANAGED_KEYS.iter().any(|k| {
                    trimmed.starts_with(k) && trimmed[k.len()..].trim_start().starts_with(':')
                }) {
                    extra_fm.push(trimmed.to_string());
                }
            }
            let after = &rest[end + 4..]; // skip "\n---"
            body = after.trim_start_matches(['\r', '\n']).to_string();
        } else {
            body = text.to_string();
        }
    } else {
        body = text.to_string();
    }

    Parsed {
        pin_id,
        color,
        pinned,
        extra_fm,
        body,
    }
}

fn note_markdown(note: &Note, extra_fm: &[String]) -> String {
    let body = to_obsidian_body(&note.content);
    let mut fm = format!(
        "pin_id: {}\ncolor: \"{}\"\npinned: {}\ncreated: {}\nupdated: {}",
        note.id,
        note.color,
        note.is_pinned,
        fmt_date(note.created_at),
        fmt_date(note.updated_at)
    );
    for line in extra_fm {
        fm.push('\n');
        fm.push_str(line);
    }
    format!("---\n{}\n---\n\n{}\n", fm, body)
}

fn read_parsed(path: &Path) -> Option<Parsed> {
    fs::read_to_string(path).ok().map(|t| parse_md(&t))
}

/// Map of pin_id -> file path for every tagged .md in the vault (single dir scan).
fn scan_vault(vault: &Path) -> Vec<(PathBuf, Parsed)> {
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(vault) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Some(parsed) = read_parsed(&p) {
                    out.push((p, parsed));
                }
            }
        }
    }
    out
}

fn file_mtime_secs(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn desired_path(vault: &Path, note: &Note, files: &[(PathBuf, Parsed)]) -> PathBuf {
    let base = sanitize_filename(&note_title(&note.content));
    let plain = vault.join(format!("{}.md", base));
    // If a *different* note already owns that filename, disambiguate with a short id.
    let collision = files.iter().any(|(p, parsed)| {
        *p == plain && parsed.pin_id.as_deref() != Some(note.id.as_str())
    });
    if collision {
        vault.join(format!("{}-{}.md", base, short_id(&note.id)))
    } else {
        plain
    }
}

/// Write (or rewrite) a note's `.md` file, preserving the user's extra front-matter
/// and renaming the file if the note's title changed.
pub fn write_note_file(vault: &Path, note: &Note) -> std::io::Result<()> {
    fs::create_dir_all(vault)?;
    let files = scan_vault(vault);
    let existing: Option<&(PathBuf, Parsed)> = files
        .iter()
        .find(|(_, parsed)| parsed.pin_id.as_deref() == Some(note.id.as_str()));
    let extra = existing.map(|(_, p)| p.extra_fm.clone()).unwrap_or_default();
    let target = desired_path(vault, note, &files);

    if let Some((old_path, _)) = existing {
        if *old_path != target {
            let _ = fs::remove_file(old_path);
        }
    }
    fs::write(&target, note_markdown(note, &extra))
}

/// Delete the `.md` file that belongs to a note id, if any.
pub fn delete_note_file(vault: &Path, id: &str) {
    for (p, parsed) in scan_vault(vault) {
        if parsed.pin_id.as_deref() == Some(id) {
            let _ = fs::remove_file(p);
        }
    }
}

/// One full bidirectional reconcile between storage and the vault.
/// Returns true if anything in storage changed (so the UI should refresh).
pub fn sync_once(storage: &NotesStorage, vault: &Path) -> bool {
    if fs::create_dir_all(vault).is_err() {
        return false;
    }
    let notes = match storage.get_all_notes() {
        Ok(n) => n,
        Err(_) => return false,
    };
    let files = scan_vault(vault);
    let mut changed = false;
    let mut ids_with_files: HashSet<String> = HashSet::new();

    // --- Pull: walk every file in the vault ---
    for (path, parsed) in &files {
        match &parsed.pin_id {
            Some(pid) => {
                ids_with_files.insert(pid.clone());
                if let Some(note) = notes.iter().find(|n| &n.id == pid) {
                    let current = to_obsidian_body(&note.content);
                    if parsed.body.trim_end() != current.trim_end() {
                        let fmtime = file_mtime_secs(path);
                        if fmtime > note.updated_at {
                            // Obsidian edit wins. Only the text changes, so a stale snapshot
                            // can't undo a color/size/position change made meanwhile.
                            let body = from_obsidian_body(parsed.body.trim_end());
                            if let Ok(Some(_)) = storage.update_note_with(pid, false, |n| {
                                n.content = body;
                                n.updated_at = fmtime;
                            }) {
                                changed = true;
                            }
                        } else {
                            // Pin Notes is newer — push our version back out.
                            let _ = write_note_file(vault, note);
                        }
                    }
                } else {
                    // File carries a pin_id we don't know — adopt it as a new note.
                    let mut new = Note::new(
                        pid.clone(),
                        parsed.color.clone().unwrap_or_else(|| DEFAULT_COLOR.into()),
                        200,
                        200,
                    );
                    new.content = from_obsidian_body(parsed.body.trim_end());
                    new.is_visible = false;
                    new.is_pinned = parsed.pinned;
                    if storage.create_note(new).is_ok() {
                        changed = true;
                    }
                }
            }
            None => {
                // A brand-new note authored inside Obsidian — create it, then stamp the
                // pin_id back into the file so it's tracked from now on.
                let id = uuid::Uuid::new_v4().to_string();
                let mut note = Note::new(
                    id.clone(),
                    parsed.color.clone().unwrap_or_else(|| DEFAULT_COLOR.into()),
                    200,
                    200,
                );
                note.content = from_obsidian_body(parsed.body.trim_end());
                note.is_visible = false;
                note.is_pinned = parsed.pinned;
                if storage.create_note(note.clone()).is_ok() {
                    let _ = fs::remove_file(path); // old untracked name
                    let _ = write_note_file(vault, &note);
                    ids_with_files.insert(id);
                    changed = true;
                }
            }
        }
    }

    // --- Push: any note without a file gets one (covers tray/hotkey-created notes
    //     and notes whose file was removed in Obsidian — Pin Notes owns existence). ---
    for note in &notes {
        if !ids_with_files.contains(&note.id) {
            let _ = write_note_file(vault, note);
        }
    }

    changed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn highlight_colors_strip_and_restore() {
        assert_eq!(to_obsidian_body("a =={pink}b== c"), "a ==b== c");
        assert_eq!(from_obsidian_body("a ==b== c"), "a =={yellow}b== c");
        assert_eq!(from_obsidian_body("=={pink}b=="), "=={pink}b==");
    }

    #[test]
    fn unicode_bodies_survive() {
        let s = "café 😀 日本語 =={blue}hé==";
        assert_eq!(from_obsidian_body(&to_obsidian_body(s)), "café 😀 日本語 =={yellow}hé==");
    }

    /// BUG: any literal `==` (code, maths) coming back from Obsidian gets `{yellow}` injected.
    #[test]
    fn plain_double_equals_is_not_a_highlight() {
        assert_eq!(from_obsidian_body("if a == b {"), "if a == b {");
    }

    #[test]
    fn front_matter_parsed_and_extra_keys_kept() {
        let p = parse_md("---\npin_id: abc\ncolor: \"#fff\"\npinned: true\ntags: [x]\n---\n\nbody\n");
        assert_eq!(p.pin_id.as_deref(), Some("abc"));
        assert_eq!(p.color.as_deref(), Some("#fff"));
        assert!(p.pinned);
        assert_eq!(p.extra_fm, vec!["tags: [x]".to_string()]);
        assert_eq!(p.body, "body\n");
    }

    #[test]
    fn windows_line_endings_front_matter() {
        let p = parse_md("---\r\npin_id: abc\r\n---\r\n\r\nbody");
        assert_eq!(p.pin_id.as_deref(), Some("abc"));
        assert_eq!(p.body, "body");
    }

    #[test]
    fn filenames_are_safe() {
        assert_eq!(sanitize_filename("a/b:c*?\"<>|"), "a-b-c------");
        assert_eq!(sanitize_filename("   "), "Untitled Note");
        assert_eq!(sanitize_filename("..."), "Untitled Note");
        assert_eq!(sanitize_filename(&"x".repeat(200)).len(), 60);
        assert_eq!(note_title("# **Hello** ==world=="), "Hello  world");
    }

    #[test]
    fn highlights_with_triple_equals_and_unclosed_runs_are_left_alone() {
        assert_eq!(from_obsidian_body("a === b"), "a === b");
        assert_eq!(from_obsidian_body("==open only"), "==open only");
        assert_eq!(from_obsidian_body("x ==hi== and ==yo=="), "x =={yellow}hi== and =={yellow}yo==");
        assert_eq!(from_obsidian_body("line1 ==a\nb=="), "line1 ==a\nb==");
    }

    #[test]
    fn sync_pulls_obsidian_edits_without_touching_other_fields() {
        let dir = std::env::temp_dir().join(format!("pinnotes-sync-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let vault = dir.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let storage = NotesStorage::at(dir.join("notes.json"));
        let mut n = Note::new("id-1".into(), "#fff".into(), 0, 0);
        n.content = "Hello".into();
        n.updated_at = 0; // older than any file
        storage.create_note(n.clone()).unwrap();
        write_note_file(&vault, &n).unwrap();
        // Meanwhile the app moved the note; then Obsidian edits the text.
        storage.update_note_with("id-1", false, |x| x.position_x = 777).unwrap();
        let path = vault.join("Hello.md");
        let text = fs::read_to_string(&path).unwrap().replace("Hello", "Hello from Obsidian");
        fs::write(&path, text).unwrap();
        assert!(sync_once(&storage, &vault));
        let got = storage.get_note("id-1").unwrap().unwrap();
        assert_eq!(got.content, "Hello from Obsidian");
        assert_eq!(got.position_x, 777);
    }

    /// Windows refuses reserved device names like CON / NUL / COM1 as file names.
    #[test]
    fn reserved_windows_names_are_avoided() {
        let n = sanitize_filename("CON");
        assert_ne!(n.to_uppercase(), "CON");
    }
}
