// SPDX-License-Identifier: AGPL-3.0-only
// Per-note launchers contain only the portable identity and display name, never note text.
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

pub fn valid_id(id: &str) -> bool {
    let Some((namespace, counter)) = id.split_once(':') else { return false; };
    !namespace.is_empty() && namespace.len() <= 64 && namespace.as_bytes()[0].is_ascii_alphanumeric() &&
        namespace.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)) &&
        !counter.is_empty() && !counter.starts_with('0') && counter.bytes().all(|b| b.is_ascii_digit()) &&
        counter.parse::<u64>().is_ok_and(|n| n <= 9_007_199_254_740_991)
}

fn valid_file(file: &str) -> bool {
    !file.is_empty() && file.len() <= 512 && file != "." && file != ".." &&
        !file.chars().any(|c| c.is_control() || "/\\<>:\"|?*".contains(c))
}
fn title(file: &str) -> &str {
    match file.rsplit_once('.') { Some((stem, ext)) if !stem.is_empty() && ext.eq_ignore_ascii_case("md") => stem, _ => file }
}

fn path(data: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) { return Err("invalid note identity".into()); }
    Ok(data.join("applications").join(format!("rapier-note-{id}.desktop")))
}

fn desktop_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\n', "\\n").replace('\r', "\\r").replace('\t', "\\t")
}

fn entry(exe: &Path, file: &str, id: &str) -> Result<String, String> {
    if !valid_id(id) || !valid_file(file) { return Err("invalid note shortcut".into()); }
    let executable = exe.to_str().ok_or("the application path is not UTF-8")?;
    if !exe.is_absolute() || executable.chars().any(char::is_control) { return Err("invalid application path".into()); }
    // Exec quoting is parsed first as a desktop value, then as an argument list. Percent is a field code.
    let quoted = executable.replace('%', "%%").replace('\\', "\\\\").replace('"', "\\\"").replace('`', "\\`").replace('$', "\\$");
    Ok(format!("[Desktop Entry]\nType=Application\nName={}\nExec={}\nIcon=rapier\nTerminal=false\nStartupWMClass=rapier\n",
        desktop_value(title(file)), desktop_value(&format!("\"{quoted}\" --note={id}"))))
}

fn write(data: &Path, exe: &Path, file: &str, id: &str, existing_only: bool) -> Result<bool, String> {
    let target = path(data, id)?;
    let text = entry(exe, file, id)?;
    if existing_only && !target.try_exists().map_err(|e| e.to_string())? { return Ok(false); }
    let directory = target.parent().unwrap();
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let stage = directory.join(format!(".rapier-note-{}.new", crate::random_hex(12)));
    let result = (|| -> std::io::Result<()> {
        let mut output = OpenOptions::new().write(true).create_new(true).mode(0o600).open(&stage)?;
        output.write_all(text.as_bytes())?; output.sync_all()?;
        fs::rename(&stage, &target)?;
        std::fs::File::open(directory)?.sync_all()
    })();
    if result.is_err() { let _ = fs::remove_file(&stage); }
    result.map(|_| true).map_err(|e| e.to_string())
}

pub fn uninstall(data: &Path) {
    let Ok(entries) = fs::read_dir(data.join("applications")) else { return; };
    for entry in entries.flatten() {
        let name = entry.file_name(); let name = name.to_string_lossy();
        if name.strip_prefix("rapier-note-").and_then(|s| s.strip_suffix(".desktop")).is_some_and(valid_id) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

pub fn call(operation: &str, args: &Value) -> Result<Value, String> {
    let id = args["id"].as_str().ok_or("missing note identity")?;
    let data = crate::data_dir();
    if operation == "notes.gone" {
        let target = path(&data, id)?;
        match fs::remove_file(target) {
            Ok(()) => {}, Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}, Err(e) => return Err(e.to_string()),
        }
        return Ok(json!({}));
    }
    let file = args["file"].as_str().ok_or("missing note name")?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let requested = write(&data, &exe, file, id, operation == "notes.opened")?;
    Ok(json!({"requested": requested}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_and_names_cannot_add_launch_commands() {
        for id in ["", "../note", "x;y", "x%f", "x\ny"] {
            assert!(!valid_id(id));
        }
        for name in ["../note.md", "name\nExec=bad.md", "a\\b.md", "a\"b.md", ".."] {
            assert!(entry(Path::new("/opt/rapier"), name, "abc:123").is_err());
        }
        let text = entry(Path::new("/opt/a % $ \" \\ ` bin/rapier"), "Café & tea.md", "abc:123").unwrap();
        assert!(text.contains("Name=Café & tea\n"));
        assert_eq!(text.lines().filter(|s| s.starts_with("Exec=")).count(), 1);
        assert!(text.contains("%%")); assert!(text.ends_with("StartupWMClass=rapier\n"));
    }
    #[test]
    fn pin_updates_only_its_identity_and_open_does_not_pin() {
        let data = std::env::temp_dir().join(format!("rapier-note-shortcuts-{}", crate::random_hex(12)));
        fs::create_dir_all(&data).unwrap();
        let exe = Path::new("/opt/Rapier/rapier-linux");
        assert!(!write(&data, exe, "One.md", "abc:1", true).unwrap());
        assert!(write(&data, exe, "One.md", "abc:1", false).unwrap());
        assert!(write(&data, exe, "Two.md", "abc:2", false).unwrap());
        assert!(write(&data, exe, "Renamed.md", "abc:1", true).unwrap());
        assert!(fs::read_to_string(path(&data,"abc:1").unwrap()).unwrap().contains("Name=Renamed\n"));
        assert!(fs::read_to_string(path(&data,"abc:2").unwrap()).unwrap().contains("Name=Two\n"));
        assert_eq!(fs::read_dir(data.join("applications")).unwrap().count(), 2);
        let unrelated = data.join("applications/keep.desktop"); fs::write(&unrelated, "keep").unwrap();
        uninstall(&data);
        assert!(!path(&data,"abc:1").unwrap().exists() && !path(&data,"abc:2").unwrap().exists());
        assert_eq!(fs::read_to_string(unrelated).unwrap(), "keep");
        fs::remove_dir_all(data).unwrap();
    }
}
