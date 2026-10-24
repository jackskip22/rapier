// SPDX-License-Identifier: AGPL-3.0-only
// The page, parts and plug-ins inside the executable, unpacked once per content hash, and the launcher entry.
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

static PAYLOAD: &[u8] = include_bytes!(env!("RAPIER_PAYLOAD"));
static CONTENTS: &[u8] = include_bytes!(env!("RAPIER_CONTENTS"));
static VERSION: &str = env!("RAPIER_VERSION");

/// What `--version` and `--help` print: the version, and the commit the build was made from (tools/stage-linux.mjs), so two builds
/// of one version tell themselves apart.
pub fn version_line() -> String {
    match option_env!("RAPIER_BUILD").filter(|b| !b.is_empty()) {
        Some(build) => format!("{VERSION} ({build})"),
        None => VERSION.to_string(),
    }
}

fn cache_root() -> PathBuf {
    std::env::var_os("XDG_CACHE_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| crate::home().join(".cache"))
        .join("rapier")
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn verified(target: &Path) -> bool {
    let Ok(records) = serde_json::from_slice::<Vec<(String, u64, String)>>(CONTENTS) else {
        return false;
    };
    !records.is_empty()
        && records.iter().all(|(name, size, digest)| {
            let path = Path::new(name);
            if path
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
            {
                return false;
            }
            let mut current = target.to_path_buf();
            for part in path.components() {
                current.push(part);
                if fs::symlink_metadata(&current)
                    .map(|m| m.file_type().is_symlink())
                    .unwrap_or(true)
                {
                    return false;
                }
            }
            let Ok(mut file) = fs::File::open(&current) else {
                return false;
            };
            if !file
                .metadata()
                .map(|m| m.is_file() && m.len() == *size)
                .unwrap_or(false)
            {
                return false;
            }
            let mut hash = Sha256::new();
            let mut buffer = [0u8; 65536];
            loop {
                match file.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(n) => hash.update(&buffer[..n]),
                    Err(_) => return false,
                }
            }
            hex(&hash.finalize()) == *digest
        })
}

/// Reuse only the exact embedded inventory; repair damaged or partial cache files.
pub fn unpacked() -> Result<PathBuf, String> {
    let stamp = hex(&Sha256::digest(PAYLOAD));
    let root = cache_root();
    let target = root.join(&stamp);
    if target.join(".complete").is_file() && verified(&target) {
        return Ok(target);
    }
    fs::create_dir_all(&root).map_err(|e| format!("cannot create {}: {e}", root.display()))?;
    let staging = root.join(format!("{stamp}.part-{}", crate::random_hex(8)));
    fs::create_dir(&staging).map_err(|e| e.to_string())?;
    let result = (|| {
        let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(PAYLOAD));
        for entry in archive.entries().map_err(|e| e.to_string())? {
            let mut entry = entry.map_err(|e| e.to_string())?;
            if entry.header().entry_type().is_dir() {
                continue;
            }
            if !entry.header().entry_type().is_file() {
                return Err(
                    "this file is damaged (an entry is not a plain file). Download it again."
                        .into(),
                );
            }
            let name = entry.path().map_err(|e| e.to_string())?.into_owned();
            if name
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
            {
                return Err(
                    "this file is damaged (an entry points outside it). Download it again.".into(),
                );
            }
            let path = staging.join(&name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            fs::write(&path, bytes).map_err(|e| e.to_string())?;
        }
        if !verified(&staging) {
            return Err("the embedded app inventory does not match its files".into());
        }
        fs::write(staging.join(".complete"), stamp.as_bytes()).map_err(|e| e.to_string())?;
        if target.exists() {
            let _ = fs::remove_dir_all(&target);
        }
        fs::rename(&staging, &target).map_err(|e| e.to_string())?;
        Ok(target)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

fn refresh_desktop(data: &Path) {
    for (tool, folder) in [
        ("update-desktop-database", "applications"),
        ("update-mime-database", "mime"),
    ] {
        if let Some(path) = crate::which(tool) {
            let _ = std::process::Command::new(path)
                .arg(data.join(folder))
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
    }
}

/// Chromium names an app window on Wayland after its address and profile (chrome-<app>-<profile>), whatever --class
/// says; a hidden entry by that name gives the window rapier's name and icon there (on X11 StartupWMClass=rapier does).
pub const WAYLAND_ENTRY: &str = "chrome-rapier.local__rapier.html-Default.desktop";

fn places(data: &Path) -> [PathBuf; 4] {
    [
        data.join("applications/rapier.desktop"),
        data.join("applications").join(WAYLAND_ENTRY),
        data.join("mime/packages/rapier.xml"),
        data.join("icons/hicolor/512x512/apps/rapier.png"),
    ]
}

/// The launcher entry points at this file where it is (Omarchy's launcher and every desktop read it).
pub fn install(app: &Path) -> Result<(), String> {
    let me = std::env::current_exe().map_err(|e| e.to_string())?;
    let me = fs::canonicalize(&me).unwrap_or(me);
    let data = crate::data_dir();
    let [desktop, window, mime, icon] = places(&data);
    for path in [&desktop, &mime, &icon] {
        fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    }
    fs::copy(app.join("rapier-mime.xml"), &mime).map_err(|e| e.to_string())?;
    fs::copy(app.join("rapier.png"), &icon).map_err(|e| e.to_string())?;
    let quoted = format!(
        "\"{}\"",
        me.to_string_lossy()
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('`', "\\`")
            .replace('$', "\\$")
    );
    // Every Exec line (the entry and each action) points at this file.
    let entry: String = fs::read_to_string(app.join("rapier.desktop"))
        .map_err(|e| e.to_string())?
        .lines()
        .map(|l| match l.strip_prefix("Exec=rapier ") { Some(rest) => format!("Exec={quoted} {rest}\n"), None => format!("{l}\n") })
        .collect();
    fs::write(&desktop, &entry).map_err(|e| e.to_string())?;
    // The hidden entry names the window only: no file types, no actions.
    let hidden: String = entry.lines().take_while(|l| !l.starts_with("[Desktop Action"))
        .filter(|l| !l.starts_with("MimeType=") && !l.starts_with("Actions=") && !l.is_empty()).map(|l| format!("{l}\n")).collect();
    fs::write(&window, hidden + "NoDisplay=true\n").map_err(|e| e.to_string())?;
    refresh_desktop(&data);
    defaults(true);
    // On Omarchy, its theme-set and font-set hooks tell a running rapier at once (main.rs --theme-changed).
    if crate::home().join(".config/omarchy").is_dir() {
        for hook in omarchy_hooks() {
            fs::create_dir_all(hook.parent().unwrap()).map_err(|e| e.to_string())?;
            fs::write(&hook, format!("#!/bin/bash\n# Written by rapier --install: a running rapier follows the new theme.\nexec {quoted} --theme-changed\n"))
                .map_err(|e| e.to_string())?;
        }
    }
    println!("Rapier is in your app launcher and opens Markdown and .rapier.html files.");
    if crate::home().join(".config/omarchy").is_dir() {
        println!("On Omarchy, `sudo pacman -S perl-file-mimeinfo` lets `xdg-open file.md` open Rapier too.");
    }
    println!(
        "Keep this file where it is ({}); after moving it, run it again with --install.",
        me.display()
    );
    Ok(())
}

pub fn uninstall() {
    let data = crate::data_dir();
    for path in places(&data) {
        let _ = fs::remove_file(path);
    }
    let _ = fs::remove_dir_all(cache_root());
    refresh_desktop(&data);
    defaults(false);
    for hook in omarchy_hooks() {
        let _ = fs::remove_file(hook);
    }
    println!("Rapier is removed from your app launcher. Your documents and notes are untouched.");
}

/// The person's own default apps (~/.config/mimeapps.list): --install makes rapier the default for Markdown and
/// .rapier.html where nothing is the default yet, so a file manager or the portal opens them in rapier rather than in
/// another app that also lists text/markdown. A default the person chose stays. --uninstall removes only rapier's lines.
fn defaults(install: bool) {
    const TYPES: [&str; 3] = ["text/markdown", "text/x-markdown", "application/x-rapier-html"];
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| crate::home().join(".config"));
    let path = config.join("mimeapps.list");
    let text = fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<String> = text.lines().map(String::from).collect();
    let section = |lines: &Vec<String>| lines.iter().position(|l| l.trim() == "[Default Applications]");
    let in_defaults = |lines: &Vec<String>, at: usize, key: &str| {
        lines[at + 1..]
            .iter()
            .take_while(|l| !l.trim_start().starts_with('['))
            .any(|l| l.split_once('=').map(|(k, _)| k.trim() == key).unwrap_or(false))
    };
    if install {
        let at = match section(&lines) {
            Some(at) => at,
            None => {
                if lines.last().is_some_and(|l| !l.trim().is_empty()) {
                    lines.push(String::new());
                }
                lines.push("[Default Applications]".into());
                lines.len() - 1
            }
        };
        let missing: Vec<String> = TYPES
            .iter()
            .filter(|t| !in_defaults(&lines, at, t))
            .map(|t| format!("{t}=rapier.desktop"))
            .collect();
        if missing.is_empty() {
            return;
        }
        for (i, line) in missing.into_iter().enumerate() {
            lines.insert(at + 1 + i, line);
        }
    } else {
        let before = lines.len();
        lines.retain(|l| !TYPES.iter().any(|t| l.trim() == format!("{t}=rapier.desktop")));
        if lines.len() == before {
            return;
        }
    }
    let _ = fs::create_dir_all(&config);
    let _ = fs::write(&path, lines.join("\n") + "\n");
}

/// The Omarchy hook drop-ins rapier installs (omarchy-hook runs every file in ~/.config/omarchy/hooks/<name>.d/).
pub fn omarchy_hooks() -> [PathBuf; 2] {
    let hooks = crate::home().join(".config/omarchy/hooks");
    [hooks.join("theme-set.d/rapier"), hooks.join("font-set.d/rapier")]
}
