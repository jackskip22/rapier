// SPDX-License-Identifier: AGPL-3.0-only
// The page's host: the browser over the DevTools pipe, the page's messages, opening and saving. A line-for-line
// carriage of linux/rapier's Host, so the page meets the same contract on every Linux install.
use crate::{files, folder::Broker, portal, theme, Event, ORIGIN, PAGE};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, VecDeque};
use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{FromRawFd, RawFd};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{Receiver, Sender};

const CHUNK: usize = 128 * 1024;
const MAX_MESSAGE: usize = 512 * 1024;
// Opened as their bytes, untouched (an OpenRaster painting goes to the page's own reader).
const BINARY: [&str; 5] = [".docx", ".pdf", ".textpack", ".zip", ".ora"];
const CAPABILITIES: [&str; 15] = [
    "documentPicker",
    "saveAs",
    "saveInPlace",
    "artifactExport",
    "openedFileBinding",
    "currentDocumentRead",
    "fileDetach",
    "externalOpen",
    "windowDocumentState",
    "resources",
    "originalFolder",
    "exclusiveNewDestination",
    "newWindow",
    "chooseSave",
    "recents",
];

/// The recent files list (Settings' recent files, as Windows and Android keep theirs): the newest first, 24 at most, in
/// Rapier's own data folder so every display shares it. Only the document a window holds enters it; only a listed path reopens.
const RECENTS_CAP: usize = 24;
fn recents_file() -> PathBuf {
    crate::data_dir().join("rapier").join("recents.json")
}
fn read_recents() -> Vec<String> {
    std::fs::read(recents_file()).ok().and_then(|b| serde_json::from_slice::<Vec<String>>(&b).ok()).unwrap_or_default()
        .into_iter().filter(|p| p.starts_with('/')).take(RECENTS_CAP).collect()
}
fn recents_state() -> Value {
    Value::Array(read_recents().into_iter().map(|path| json!({"name": basename(&path), "path": path,
        "documentAuthority": files::authority_for(&path), "key": path})).collect())
}
fn note_recent(path: &str) -> std::io::Result<()> {
    let mut list = vec![path.to_string()];
    list.extend(read_recents().into_iter().filter(|p| p != path));
    list.truncate(RECENTS_CAP);
    let file = recents_file();
    std::fs::create_dir_all(file.parent().unwrap())?;
    let staged = file.with_extension("json.part");
    std::fs::write(&staged, serde_json::to_vec(&list).unwrap_or_default())?;
    std::fs::rename(staged, file)
}

// Runs in every frame before the page. Only the top rapier page keeps the bridge; the host also refuses any binding
// call from another execution context.
const ADAPTER: &str = r#"(() => {
  const send = globalThis.__rapierLinux;
  try { delete globalThis.__rapierLinux; } catch (_) {}
  if (location.origin !== 'https://rapier.local' || location.pathname !== '/rapier.html' || window.top !== window || typeof send !== 'function') return;
  Object.defineProperty(window, '__RAPIER_NATIVE_PLATFORM_ID', { value: 'linux', configurable: false });
  // This window's number: its recovery and writer lease are its own (shell/platform.js RAPIER_RECOVERY_SCOPE).
  Object.defineProperty(window, '__RAPIER_NATIVE_WINDOW', { value: __RAPIER_SLOT__, configurable: false });
  const make = channel => ({ onmessage: null, postMessage(value) { send(JSON.stringify({ channel, payload: String(value == null ? '' : value) })); } });
  const host = make('host'), intake = make('intake');
  // The browser's own shortcuts are not Rapier's: view-source, the developer tools, downloads and the clear-data sheet do nothing in
  // this window. At the end of the bubble, after the page's own handlers (Chrome keeps Ctrl+N, Ctrl+T and Ctrl+Shift+N to itself).
  // Ctrl+Q quits Rapier, as it does in every Linux application: the host has each window keep its work, then closes them all.
  window.addEventListener('keydown', event => {
    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && String(event.key || '').toLowerCase() === 'q' && !event.defaultPrevented) {
      event.preventDefault();
      host.postMessage(JSON.stringify({ id: 'quit', operation: 'app.quit', arguments: {} }));
    }
  });
  window.addEventListener('keydown', event => {
    const key = String(event.key || '').toLowerCase(), mod = event.ctrlKey || event.metaKey;
    if (event.defaultPrevented) return;
    if (key === 'f12' || (mod && !event.altKey && ((!event.shiftKey && (key === 'u' || key === 'j' || key === 'p')) || (event.shiftKey && (key === 'i' || key === 'j' || key === 'c' || key === 'delete' || key === 't'))))) event.preventDefault();
  });
  Object.defineProperty(window, 'RapierHost', { value: host, configurable: false });
  Object.defineProperty(window, 'RapierIntake', { value: intake, configurable: false });
  const theme = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, theme];
  Object.defineProperty(window, '__rapierLinuxTheme', { configurable: false, value: css => theme.replaceSync(String(css)) });
  // Until the editor names the document, the window is "Rapier", not the website's search title.
  let searchTitle = null;
  const titled = new MutationObserver(() => {
    const element = document.querySelector('head > title');
    if (!element) return;
    titled.disconnect();
    searchTitle = element.textContent;
    document.title = 'Rapier';
  });
  titled.observe(document, { childList: true, subtree: true });
  // The title names the folder of the window's file, so two windows on s.md from two folders read differently
  // The host gives it (Host::label_window); the page's own title is kept before it.
  let folder = '', added = '', shownName = '', realName = '';
  const label = () => {
    let title = document.title;
    if (added && title.endsWith(added)) title = title.slice(0, -added.length);
    added = folder && title.startsWith('Rapier — ') ? ' (' + folder + ')' : '';
    // The page holds a name its one filename rule accepts (a zero-width joiner in an emoji name becomes `_`); the title keeps the file's own.
    const named = realName && shownName && realName !== shownName && title.startsWith('Rapier — ' + shownName) ? 'Rapier — ' + realName + title.slice(('Rapier — ' + shownName).length) : title;
    if (document.title !== named + added) document.title = named + added;
  };
  new MutationObserver(label).observe(document, { childList: true, subtree: true, characterData: true });
  // Ctrl+Q: every owner in this window keeps its work (the page's checkpoint, waited for), then the host is told.
  Object.defineProperty(window, '__rapierLinuxQuit', { configurable: false, value: () => {
    const kept = [];
    try {
      window.dispatchEvent(new CustomEvent('rapier:checkpoint-requested', { detail: { checkpoint: 0,
        waitUntil: completion => { kept.push(Promise.resolve(completion).then(value => value === true, () => false)); } } }));
    } catch (_) {}
    Promise.all(kept).catch(() => {}).finally(() => host.postMessage(JSON.stringify({ id: 'quit-kept', operation: 'app.quitKept', arguments: {} })));
  } });
  Object.defineProperty(window, '__rapierLinuxFolder', { configurable: false, value: (value, shown, real) => { folder = String(value || ''); shownName = String(shown || ''); realName = String(real || ''); label(); } });
  addEventListener('DOMContentLoaded', () => { titled.disconnect(); if (searchTitle !== null && document.title === searchTitle) document.title = 'Rapier'; }, { once: true });
  // The host keeps every window inside the screen's work area (fit_window, cascade): the page tells it the area and
  // this window's size.
  const fit = () => {
    if (screen.availWidth > 0 && screen.availHeight > 0)
      send(JSON.stringify({ channel: 'window', payload: JSON.stringify({ outerWidth, outerHeight,
        left: screen.availLeft || 0, top: screen.availTop || 0, width: screen.availWidth, height: screen.availHeight }) }));
  };
  addEventListener('load', () => { fit(); setTimeout(fit, 1000); }, { once: true });
  Object.defineProperty(window, '__rapierLinuxDeliver', { configurable: false, value: value => {
    const target = value && value.channel === 'host' ? host : value && value.channel === 'intake' ? intake : null;
    if (target && typeof target.onmessage === 'function') target.onmessage({ data: String(value.payload == null ? '' : value.payload) });
  } });
})();"#;

fn content_type(name: &str) -> &'static str {
    match Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
    {
        "html" => "text/html; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "json" => "application/json",
        "wasm" => "application/wasm",
        "png" => "image/png",
        _ => "application/octet-stream",
    }
}

/// One document, however it is spelled: the same path, or two paths that reach the same file (a symlink, a `..` through one).
fn same_document(held: &str, path: &str) -> bool {
    held == path
        || matches!((std::fs::canonicalize(held), std::fs::canonicalize(path)), (Ok(a), Ok(b)) if a == b)
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// A file's name as the page may hold it. The page's one filename rule refuses the characters Windows and the file formats
/// cannot carry (`\ / < > "`, controls, invisible marks) and names over 512 characters; Linux allows them all, so such a file
/// opens under a name with `_` in their place. Where it is saved is the bound path, never this name.
fn shown_name(path: &str) -> String {
    let name: String = basename(path)
        .chars()
        .map(|c| match c {
            '\\' | '/' | '<' | '>' | '"' | '\u{7f}' | '\u{200b}'..='\u{200f}' | '\u{2028}'..='\u{202e}' | '\u{2066}'..='\u{2069}' | '\u{feff}' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .take(400)
        .collect();
    if name.trim().is_empty() || name == "." || name == ".." { "document.md".to_string() } else { name }
}

fn str_of(value: &Value, key: &str) -> String {
    match value.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

struct Intake {
    begin: Value,
    sent_end: bool,
    restart: bool,
    id: u64,
    delivery: u64,
    frame: String,
    bytes: Vec<u8>,
    offset: usize,
    sequence: u64,
    generation: String,
}
#[derive(Clone)]
struct Bound {
    path: String,
    authority: String,
    generation: String,
}
struct Candidate {
    id: u64,
    bound: Bound,
}
struct Transfer {
    // The destination save.choose gave (its token), or empty: the chooser then comes after the bytes, as before.
    chosen: String,
    request_id: String,
    purpose: String,
    name: String,
    authority: String,
    document_generation: Value,
    document_revision: Value,
    length: usize,
    digest: String,
    exclusive: bool,
    file_generation: Value,
    frame: String,
    sequence: u64,
    bytes: Vec<u8>,
}
/// What a file chooser was asked for, kept until its answer arrives (the chooser runs off the host's loop).
enum Pick {
    Open { ident: String, compare: bool },
    Folder { ident: String },
    Save(Transfer),
    /// Save As, asked before the bytes exist (save.choose): the page makes them for the type of the name chosen.
    SaveName { ident: String, name: String },
}
struct Folder {
    token: String,
    broker: Broker,
}

impl Folder {
    fn call(&mut self, method: &str, args: &Value) -> Result<Value, String> {
        self.broker.dispatch(method, args)
    }
}

/// One window's own state. The Host's fields of the same names belong to the window being served; the others wait
/// here and are swapped in when a DevTools message names their session (swap_to). Each window holds one document.
#[derive(Default)]
struct Win {
    session: Option<String>,
    target: String,
    context: Option<i64>,
    page_ready: bool,
    intake_ready: bool,
    recovering: bool,
    pending_paths: VecDeque<String>,
    intake: Option<Intake>,
    candidate: Option<Candidate>,
    current: Option<Bound>,
    transfer: Option<Transfer>,
    folder: Option<Folder>,
    receipts: Vec<((String, String), Value)>,
    theme_script: Option<String>,
    theme_adds: Vec<u64>,
    saved_where: Option<String>,
    window_id: Option<i64>,
    text_held: bool,
    slot: u32,
    cascade_to: Option<(i64, i64)>,
    dirty: bool,
    origin: Option<PathBuf>,
    untitled: u32,
}

pub struct Host {
    app: PathBuf,
    /// Started with --online: the page may reach the network, so it shows what needs it (the `network` capability).
    online: bool,
    out: File,
    next_id: u64,
    session: Option<String>,
    target: String,
    context: Option<i64>,
    page_ready: bool,
    intake_ready: bool,
    recovering: bool,
    pending_paths: VecDeque<String>,
    intake: Option<Intake>,
    candidate: Option<Candidate>,
    intake_id: u64,
    quit_waiting: usize,
    desktop_dark: Option<bool>,
    dark_emulated: bool,
    high_contrast: bool,
    contrast_emulated: bool,
    delivery: u64,
    current: Option<Bound>,
    transfer: Option<Transfer>,
    folder: Option<Folder>,
    receipts: Vec<((String, String), Value)>,
    theme: Option<(Option<theme::Palette>, String)>,
    theme_script: Option<String>,
    theme_adds: Vec<u64>,
    // Where a save went when no file chooser answered; the next save result names it.
    saved_where: Option<String>,
    window_id: Option<i64>,
    // A new document or text from stdin opened here: the window holds it though no file is bound.
    text_held: bool,
    // The window's number: the page keeps its recovery under it (shell/platform.js RAPIER_RECOVERY_SCOPE) and the host
    // keeps the file it is bound to (keep_binding), so a relaunch saves over the same file.
    slot: u32,
    // Where a new window goes once its page is ready (cascade).
    cascade_to: Option<(i64, i64)>,
    // The page holds unsaved work: a relaunch opens this window again (keep_binding).
    dirty: bool,
    // The folder of the file this window last opened, bound or not (a web page it imported): files go beside it.
    origin: Option<PathBuf>,
    // The number of this window's untitled document (1 is "untitled"), 0 for none: two windows never share one.
    untitled: u32,
    // The newest window, which the next one cascades from.
    newest: Option<i64>,
    // The screen's work area (left, top, width, height), as the page last reported it.
    area: Option<(i64, i64, i64, i64)>,
    // Until the first page says it is ready: past this, or if the browser closes first, Rapier says so and exits 1
    // (a browser that exited or hung left rc 0 and no window).
    launch_deadline: Option<std::time::Instant>,
    // The browser has answered, so the deadline is the page's (PAGE_WAIT).
    answered: bool,
    // The other windows, and paths waiting for a window of their own (a second document never replaces the first).
    others: Vec<Win>,
    waiting_paths: VecDeque<String>,
    /// The view the first window opens on (`--notes`, `--draw`, `--paint`, `--jxl` at launch), instead of a document.
    first_view: Option<String>,
    /// Windows sent to PAGE#v/<view> whose page has not yet been born with that fragment (show_page).
    view_jumps: Vec<String>,
    new_windows: VecDeque<String>,
    // How the browser was started, to ask it for another app window (spawn_window).
    browser_path: PathBuf,
    browser_args: Vec<String>,
    deferred: VecDeque<Event>,
    // Choosers shown and not yet answered: the window that asked (its DevTools session) and what for.
    picks: HashMap<u64, (Option<String>, Pick)>,
    next_pick: u64,
    // The window is on an X11 display (the portal's parent window can be named).
    x11: bool,
    // Destinations save.choose gave, by token, until their transfer begins: the path and whether no chooser was available.
    chosen_saves: HashMap<String, (String, bool)>,
    events: Sender<Event>,
    browser: Child,
}

const READ_ONLY_FOLDER: &str = "the folder is read-only";

/// A copy's suggested name ("five (copy).md", from the page) that a file in the folder already has becomes the next free
/// one: "five (copy 2).md", then "five (copy 3).md". Any other name is suggested as it is.
fn free_copy_name(folder: &Path, name: &str) -> String {
    let split = name.len() - if name.to_ascii_lowercase().ends_with(".rapier.html") { 12 } else { name.rfind('.').map_or(0, |dot| name.len() - dot) };
    let (stem, extension) = name.split_at(split);
    let Some(base) = stem.strip_suffix(" (copy)") else { return name.to_string() };
    std::iter::once(name.to_string())
        .chain((2..1000).map(|n| format!("{base} (copy {n}){extension}")))
        .find(|candidate| !folder.join(candidate).exists())
        .unwrap_or_else(|| name.to_string())
}

/// A tiling window manager places and sizes every window itself (wm.rs).
fn tiling() -> bool {
    crate::wm::tiling()
}

/// What a window holds when the next document arrives.
#[derive(Clone, Copy, Default)]
struct Holding {
    file: bool,
    imported: bool,
    unsaved: bool,
    given_text: bool,
    opening: bool,
    others_waiting: bool,
}

/// How the next document arrives: a file (from the command line, xdg-open or a second launch) or a new document (Ctrl+N,
/// the New button, `--new` to a running Rapier).
#[derive(Clone, Copy, Debug)]
enum Route {
    File,
    NewDocument,
}

#[derive(Debug, PartialEq)]
enum Place {
    ThisWindow,
    OwnWindow,
}

/// Where the next document goes. Only an untouched, empty window takes it, whatever the route: never one holding a file,
/// an imported web page, unsaved work or text it was given, nor one still opening something or with documents queued
/// ahead for windows of their own.
fn goes_to(window: Holding, _route: Route) -> Place {
    let Holding { file, imported, unsaved, given_text, opening, others_waiting } = window;
    if file || imported || unsaved || given_text || opening || others_waiting { Place::OwnWindow } else { Place::ThisWindow }
}

/// How long the browser has to answer at all, and then to show the first page: a browser that hangs is reported soon,
/// while a slow first start (a cold disk, a new profile) has time to load the page.
const LAUNCH_WAIT: std::time::Duration = std::time::Duration::from_secs(15);
const PAGE_WAIT: std::time::Duration = std::time::Duration::from_secs(60);

fn pipe() -> std::io::Result<(RawFd, RawFd)> {
    let mut fds = [0; 2];
    if unsafe { libc::pipe2(fds.as_mut_ptr(), libc::O_CLOEXEC) } != 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok((fds[0], fds[1]))
}

impl Host {
    pub fn launch(
        app: PathBuf,
        browser: &Path,
        online: bool,
        paths: Vec<String>,
        events: Sender<Event>,
    ) -> Result<Host, String> {
        let platform = crate::display_platform()?;
        // Snap Chromium may not write hidden folders in home (~/.local): its profile lives in the snap's own area.
        let profile = if browser.starts_with("/snap/") {
            // ...per display as well (crate::instance_dir).
            let display = crate::instance_dir().file_name().filter(|n| n.to_string_lossy().starts_with("display-"))
                .map(|n| format!("-{}", n.to_string_lossy())).unwrap_or_default();
            crate::home().join(format!("snap/chromium/common/rapier-browser{display}"))
        } else {
            crate::instance_dir().join("browser")
        };
        std::fs::create_dir_all(&profile).map_err(|e| format!("cannot create {}: {e}. Check write access to this folder.", profile.display()))?;
        crate::profile::release_foreign_lock(&profile).map_err(|e| e.to_string())?;
        // The first document opens in the first window; each other one gets a window of its own.
        // Every other window that held unsaved work opens again, each with its own recovery and file; a file it holds is
        // not opened a second time.
        let unsaved = Self::unsaved_windows();
        let mut rest: VecDeque<String> = paths.into_iter().collect();
        let mut requested = std::collections::HashSet::new();
        rest.retain(|path| !Path::new(path).is_absolute() || requested.insert(path.clone()));
        let first = rest.pop_front();
        // A view is no document: the first window opens on it, and no file is handed in.
        let first_view = first.as_deref().and_then(crate::view_of).map(str::to_string);
        let first = first.filter(|_| first_view.is_none());
        let slot = starting_slot(first.as_deref(), &unsaved);
        rest.retain(|p| !unsaved.iter().any(|(_, held)| held == p));
        rest.extend(unsaved.into_iter().filter(|(n, _)| *n != slot).map(|(n, _)| format!("{}{n}", crate::SLOT)));
        let (to_browser, out) = pipe().map_err(|e| e.to_string())?;
        let (inp, from_browser) = pipe().map_err(|e| e.to_string())?;
        // The window is named after its first URL (chrome-rapier.local__rapier.html-Default), so it opens the page at
        // once; start() loads it again once the bridge is attached. rapier.local never reaches DNS or mDNS.
        let mut args = vec![
            "--remote-debugging-pipe".to_string(),
            format!("--user-data-dir={}", profile.display()),
            format!("--app={PAGE}"),
            "--host-resolver-rules=MAP rapier.local ~NOTFOUND".into(),
            // The window's X11 class is rapier's, matching the launcher's StartupWMClass (on Wayland Chromium names it
            // chrome-rapier.local__rapier.html-Default; payload::WAYLAND_ENTRY).
            "--class=rapier".into(),
            // A native Wayland window where a Wayland display answers, else X11 (crate::display_platform).
            format!("--ozone-platform={platform}"),
            "--no-first-run".into(),
            "--no-default-browser-check".into(),
            "--disable-sync".into(),
            "--disable-component-update".into(),
            // WebGPU (the code highlighter, the paint brushes): Chromium's GPU blocklist turns it off on Linux outside
            // its own short list of GPUs and drivers. This switch turns on WebGPU alone, in this window's own profile; the
            // broader --ignore-gpu-blocklist would also lift the blocklist for WebGL, rasterization and video. A machine
            // with no GPU gets the software adapter, which Rapier's code treats as no GPU (editor/lexer.js).
            "--enable-unsafe-webgpu".into(),
        ];
        // Dawn's adapters on Linux are Vulkan's; Chromium composites with Vulkan on X11 only (not on Wayland ozone).
        if platform == "x11" {
            args.push("--enable-features=Vulkan".into());
        }
        if !online {
            args.extend(
                [
                    "--proxy-server=http://127.0.0.1:9",
                    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
                    "--disable-background-networking",
                ]
                .map(String::from),
            );
        }
        let mut command = Command::new(browser);
        command.args(&args).stdin(Stdio::null());
        // The browser's own diagnostics (D-Bus, Fontconfig) are not the person's business; RAPIER_BROWSER_LOG=1 keeps them.
        if std::env::var_os("RAPIER_BROWSER_LOG").is_none() {
            command.stdout(Stdio::null()).stderr(Stdio::null());
        }
        // The browser reads commands on fd 3 and writes replies on fd 4; every other descriptor is close-on-exec.
        unsafe {
            command.pre_exec(move || {
                let read = libc::fcntl(to_browser, libc::F_DUPFD_CLOEXEC, 10);
                let write = libc::fcntl(from_browser, libc::F_DUPFD_CLOEXEC, 10);
                if read < 0 || write < 0 || libc::dup2(read, 3) < 0 || libc::dup2(write, 4) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
        let child = command
            .spawn()
            .map_err(|e| format!("could not start {}: {e}", browser.display()))?;
        unsafe {
            libc::close(to_browser);
            libc::close(from_browser);
        }
        let reader = unsafe { File::from_raw_fd(inp) };
        let sender = events.clone();
        std::thread::spawn(move || read_browser(reader, sender));
        Ok(Host {
            app,
            out: unsafe { File::from_raw_fd(out) },
            next_id: 0,
            session: None,
            target: String::new(),
            context: None,
            page_ready: false,
            intake_ready: false,
            recovering: false,
            pending_paths: first.into_iter().collect(),
            intake: None,
            candidate: None,
            intake_id: 0,
            quit_waiting: 0,
            desktop_dark: None,
            dark_emulated: false,
            high_contrast: false,
            contrast_emulated: false,
            delivery: 0,
            current: None,
            transfer: None,
            folder: None,
            receipts: Vec::new(),
            theme: None,
            theme_script: None,
            theme_adds: Vec::new(),
            saved_where: None,
            window_id: None,
            text_held: false,
            slot,
            cascade_to: None,
            dirty: false,
            origin: None,
            untitled: 0,
            newest: None,
            area: None,
            launch_deadline: Some(std::time::Instant::now() + LAUNCH_WAIT),
            answered: false,
            others: Vec::new(),
            waiting_paths: rest,
            first_view,
            online,
            view_jumps: Vec::new(),
            new_windows: VecDeque::new(),
            browser_path: browser.to_path_buf(),
            browser_args: args.iter().filter(|a| a.as_str() != "--remote-debugging-pipe").cloned().collect(),
            deferred: VecDeque::new(),
            picks: HashMap::new(),
            next_pick: 0,
            x11: platform == "x11",
            chosen_saves: HashMap::new(),
            events,
            browser: child,
        })
    }

    /// Serve window `w`: its fields and the Host's change places.
    fn exchange(&mut self, w: &mut Win) {
        std::mem::swap(&mut self.session, &mut w.session);
        std::mem::swap(&mut self.target, &mut w.target);
        std::mem::swap(&mut self.context, &mut w.context);
        std::mem::swap(&mut self.page_ready, &mut w.page_ready);
        std::mem::swap(&mut self.intake_ready, &mut w.intake_ready);
        std::mem::swap(&mut self.recovering, &mut w.recovering);
        std::mem::swap(&mut self.pending_paths, &mut w.pending_paths);
        std::mem::swap(&mut self.intake, &mut w.intake);
        std::mem::swap(&mut self.candidate, &mut w.candidate);
        std::mem::swap(&mut self.current, &mut w.current);
        std::mem::swap(&mut self.transfer, &mut w.transfer);
        std::mem::swap(&mut self.folder, &mut w.folder);
        std::mem::swap(&mut self.receipts, &mut w.receipts);
        std::mem::swap(&mut self.theme_script, &mut w.theme_script);
        std::mem::swap(&mut self.theme_adds, &mut w.theme_adds);
        std::mem::swap(&mut self.saved_where, &mut w.saved_where);
        std::mem::swap(&mut self.window_id, &mut w.window_id);
        std::mem::swap(&mut self.text_held, &mut w.text_held);
        std::mem::swap(&mut self.slot, &mut w.slot);
        std::mem::swap(&mut self.cascade_to, &mut w.cascade_to);
        std::mem::swap(&mut self.dirty, &mut w.dirty);
        std::mem::swap(&mut self.origin, &mut w.origin);
        std::mem::swap(&mut self.untitled, &mut w.untitled);
    }

    /// Ctrl+Q: each window keeps its work (the page's checkpoint, the one it makes as it leaves), then the browser closes after a
    /// moment (Event::Quit). Unsaved words stay kept and are offered at the next start, as when a window is closed.
    fn quit_all(&mut self) {
        let mut sessions: Vec<String> = self.session.iter().cloned().collect();
        sessions.extend(self.others.iter().filter_map(|w| w.session.clone()));
        self.quit_waiting = 0;
        for session in sessions {
            if self.swap_to(&session) {
                if let Some(context) = self.context {
                    // The window answers when every owner in it has kept its work (a big document takes longer than any fixed wait).
                    self.cdp("Runtime.evaluate", json!({"expression": "globalThis.__rapierLinuxQuit && __rapierLinuxQuit()", "contextId": context}), true);
                    self.quit_waiting += 1;
                }
            }
        }
        if self.quit_waiting == 0 {
            let _ = self.events.send(Event::Quit);
            return;
        }
        let events = self.events.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(4));
            let _ = events.send(Event::Quit);
        });
    }

    /// Make the window with this DevTools session the one served; false when no window has it.
    fn swap_to(&mut self, session: &str) -> bool {
        if self.session.as_deref() == Some(session) {
            return true;
        }
        let Some(at) = self.others.iter().position(|w| w.session.as_deref() == Some(session)) else {
            return false;
        };
        let mut w = self.others.swap_remove(at);
        self.exchange(&mut w);
        self.others.push(w);
        true
    }

    /// What this window holds, for the one rule of where the next document goes (`goes_to`).
    fn holding(&self) -> Holding {
        Holding {
            file: self.current.is_some(),
            imported: self.origin.is_some(),
            unsaved: self.dirty,
            given_text: self.text_held,
            opening: self.candidate.is_some() || self.intake.is_some() || !self.pending_paths.is_empty(),
            others_waiting: !self.waiting_paths.is_empty(),
        }
    }

    /// Every file a person opens (the command line, xdg-open, a second launch, Ctrl+O) comes here. A file open already
    /// brings its window to the front; otherwise the next-document rule (`goes_to`) picks this window or one of its own.
    fn open_path(&mut self, path: String) {
        // A view (the launcher's Notes, Draw, Paint, JPEG XL converter) always opens a window of its own on it.
        if crate::view_of(&path).is_some() {
            self.waiting_paths.push_back(path);
            self.spawn_window();
        } else if let Some(target) = self.window_holding(&path) {
            self.cdp("Target.activateTarget", json!({"targetId": target}), false);
        } else if self.waiting_paths.contains(&path) && Path::new(&path).is_absolute() {
            // Its window is already being created; the queued request still owns this file.
            return;
        } else if goes_to(self.holding(), Route::File) == Place::OwnWindow {
            self.waiting_paths.push_back(path);
            self.spawn_window();
        } else {
            self.pending_paths.push_back(path);
            self.pump();
        }
    }

    /// Ask the running browser for another app window: the same profile hands the request to it (its singleton), which
    /// opens the page as an app window; Target.targetCreated then names it and adopt() attaches it.
    fn spawn_window(&mut self) {
        let _ = Command::new(&self.browser_path)
            .args(&self.browser_args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .process_group(0)
            .spawn();
    }

    /// Attach a new app window and give it the next waiting document.
    fn adopt(&mut self, receiver: &Receiver<Event>, target: String) -> Result<(), String> {
        // The newest window still open, else this one: a closed window has no place to cascade from.
        let open = |id: &i64| self.window_id == Some(*id) || self.others.iter().any(|w| w.window_id == Some(*id));
        let previous = self.newest.filter(open).or(self.window_id);
        let mut parked = Win::default();
        self.exchange(&mut parked);
        self.others.push(parked);
        self.target = target;
        // A window reopened for its unsaved work takes its old number back, and so does a file reopened after its
        // window closed with unsaved work (its kept draft is offered in that window only); any other takes the lowest
        // free number that holds nobody's draft.
        let next = self.waiting_paths.pop_front();
        let wanted = next.as_deref().and_then(|p| p.strip_prefix(crate::SLOT)).and_then(|n| n.parse::<u32>().ok())
            .filter(|n| *n > 0 && self.others.iter().all(|w| w.slot != *n));
        let folder = crate::instance_dir();
        let open: Vec<u32> = self.others.iter().map(|w| w.slot).collect();
        let kept = |n: u32| -> Option<String> {
            let value = serde_json::from_slice::<Value>(&std::fs::read(folder.join(format!("window-{n}.json"))).ok()?).ok()?;
            (value["dirty"] == json!(true)).then(|| str_of(&value, "path"))
        };
        self.slot = wanted.unwrap_or_else(|| next_slot(next.as_deref(), &open, kept));
        self.restore_binding();
        let id = self.cdp("Target.attachToTarget", json!({"targetId": self.target, "flatten": true}), false);
        self.session = Some(str_of(&self.wait(receiver, id)?, "sessionId"));
        self.prepare_window(receiver)?;
        self.cascade(receiver, previous);
        self.newest = self.window_id;
        let view = next.as_deref().and_then(crate::view_of).map(str::to_string);
        if !next.as_deref().is_some_and(|p| p.starts_with(crate::SLOT)) && view.is_none() {
            self.pending_paths.extend(next);
        }
        self.show_page(receiver, view.as_deref())
    }

    /// A window closed: its state goes, and another window is served.
    fn forget_window(&mut self, session: &str) {
        if !self.swap_to(session) {
            return;
        }
        self.close_folder();
        let mut next = self.others.pop().unwrap_or_default();
        self.exchange(&mut next);
    }

    // -- DevTools pipe ------------------------------------------------------------------------------------------------
    fn cdp(&mut self, method: &str, params: Value, session: bool) -> u64 {
        self.next_id += 1;
        let mut message = json!({"id": self.next_id, "method": method, "params": params});
        if session {
            if let Some(id) = &self.session {
                message["sessionId"] = json!(id);
            }
        }
        let mut bytes = message.to_string().into_bytes();
        bytes.push(0);
        let _ = self.out.write_all(&bytes);
        self.next_id
    }

    /// The next event. Until the first page is ready the wait is bounded, and the browser closing is a failed launch:
    /// Err says why. Ok(None) is a closed channel.
    fn next_event(&mut self, receiver: &Receiver<Event>) -> Result<Option<Event>, String> {
        let Some(deadline) = self.launch_deadline else { return Ok(receiver.recv().ok()) };
        match receiver.recv_timeout(deadline.saturating_duration_since(std::time::Instant::now())) {
            Ok(Event::Exit) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) =>
                Err(format!("the browser closed before Rapier's window opened. Check write access to the temporary folder {} (TMPDIR), or run with RAPIER_BROWSER_LOG=1 to see the browser error.", std::env::temp_dir().display())),
            Ok(event) => {
                if !self.answered {
                    self.answered = true;
                    self.launch_deadline = Some(std::time::Instant::now() + PAGE_WAIT);
                }
                Ok(Some(event))
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) if self.answered =>
                Err(format!("the browser did not show Rapier's page within {} seconds", PAGE_WAIT.as_secs())),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) =>
                Err(format!("the browser did not answer within {} seconds", LAUNCH_WAIT.as_secs())),
        }
    }

    /// Only during start: other events wait their turn in run().
    fn wait(&mut self, receiver: &Receiver<Event>, ident: u64) -> Result<Value, String> {
        let mut held = VecDeque::new();
        let result = loop {
            match self.next_event(receiver) {
                Err(launch) => break Err(launch),
                Ok(None) => std::process::exit(0),
                Ok(Some(Event::Exit)) => std::process::exit(0),
                Ok(Some(event)) => match event {
                    Event::Cdp(message) if message.get("id") == Some(&json!(ident)) => {
                        if let Some(error) = message.get("error") {
                            break Err(str_of(error, "message"));
                        }
                        break Ok(message.get("result").cloned().unwrap_or(json!({})));
                    }
                    other => held.push_back(other),
                },
            }
        };
        self.deferred.extend(held);
        result
    }

    /// What every window needs before its page loads: the served origin, the bridge, the adapter, the theme and its size.
    fn prepare_window(&mut self, receiver: &Receiver<Event>) -> Result<(), String> {
        for (method, params) in [
            (
                "Fetch.enable",
                json!({"patterns": [{"urlPattern": "*", "requestStage": "Request"}]}),
            ),
            ("Runtime.addBinding", json!({"name": "__rapierLinux"})),
            ("Runtime.enable", json!({})),
            ("Page.enable", json!({})),
            ("Inspector.enable", json!({})),
            (
                "Page.addScriptToEvaluateOnNewDocument",
                json!({"source": ADAPTER.replace("__RAPIER_SLOT__", &self.slot.to_string())}),
            ),
        ] {
            let id = self.cdp(method, params, true);
            self.wait(receiver, id)?;
        }
        self.media_to_window();
        self.theme_to_window();
        let id = self.cdp("Browser.getWindowForTarget", json!({"targetId": self.target.clone()}), false);
        self.window_id = self.wait(receiver, id).ok().and_then(|w| w.get("windowId").and_then(Value::as_i64));
        Ok(())
    }

    /// A new window opens down and to the right of the one before it, never exactly over it. A tiling
    /// window manager places windows itself and ignores this.
    /// The move waits for the page (page.ready): the browser places a new window itself when it first shows it.
    /// A new window steps 32 px down and right from the newest one, and starts again at the work area's edge when it
    /// would leave the area. A tiling window manager places windows itself: no cascade there.
    fn cascade(&mut self, receiver: &Receiver<Event>, previous: Option<i64>) {
        let Some(previous) = previous.filter(|_| !tiling()) else { return };
        let id = self.cdp("Browser.getWindowBounds", json!({"windowId": previous}), false);
        let Ok(bounds) = self.wait(receiver, id).map(|b| b["bounds"].clone()) else { return };
        if bounds["windowState"] == "normal" {
            let of = |key: &str| bounds[key].as_i64().unwrap_or(0);
            let (left, top) = (of("left") + 32, of("top") + 32);
            // Each edge wraps on its own, so a new diagonal starts beside the first instead of on top of it. The window
            // manager's frame is outside these bounds (xfwm4: a 29 px title bar), so room is left for one.
            let (frame_x, frame_y) = (16, 64);
            self.cascade_to = Some(match self.area {
                Some((area_left, area_top, width, height)) => (
                    if left + of("width") + frame_x > area_left + width { area_left } else { left },
                    if top + of("height") + frame_y > area_top + height { area_top } else { top },
                ),
                None => (left, top),
            });
        }
    }

    fn window_holding(&self, path: &str) -> Option<String> {
        let held = |current: &Option<Bound>| current.as_ref().is_some_and(|c| same_document(&c.path, path));
        let entering = |candidate: &Option<Candidate>| candidate.as_ref().is_some_and(|c| same_document(&c.bound.path, path));
        let queued = |pending: &VecDeque<String>| Path::new(path).is_absolute() && pending.iter().any(|p| same_document(p, path));
        if held(&self.current) || entering(&self.candidate) || queued(&self.pending_paths) {
            return Some(self.target.clone());
        }
        self.others.iter().find(|w| held(&w.current) || entering(&w.candidate) || queued(&w.pending_paths)).map(|w| w.target.clone())
    }

    /// Tell the page which folder its window's title names: the bound file's, else the file opened last, else none.
    fn label_window(&mut self) {
        // The title names the file's folder even before its first save makes it.
        let folder = self.origin.clone().or_else(|| self.beside());
        let shown = folder.map(|f| files::shown(&f)).unwrap_or_default();
        // The name the window's file has, and the form of it the page holds (shown_name).
        let bound = self.current.as_ref().map(|c| c.path.clone()).or_else(|| self.candidate.as_ref().map(|c| c.bound.path.clone()));
        let (page_name, real_name) = bound.map(|p| (shown_name(&p), basename(&p))).unwrap_or_default();
        if let Some(context) = self.context {
            self.cdp("Runtime.evaluate", json!({"expression": format!("globalThis.__rapierLinuxFolder && __rapierLinuxFolder({}, {}, {})", json!(shown), json!(page_name), json!(real_name)),
                "contextId": context}), true);
        }
    }

    fn binding_file(&self) -> PathBuf {
        crate::instance_dir().join(format!("window-{}.json", self.slot))
    }

    /// The file this window is bound to and whether it holds unsaved work, kept for the next launch (private, 0600): the
    /// page restores its document, Save writes over that file again, checked against the generation it was bound at, and
    /// a relaunch opens every window that held unsaved work.
    fn keep_binding(&self) {
        let file = self.binding_file();
        if self.current.is_none() && !self.dirty {
            let _ = std::fs::remove_file(file);
            return;
        }
        let mut kept = json!({"dirty": self.dirty});
        if let Some(c) = &self.current {
            kept = json!({"path": c.path, "authority": c.authority, "generation": c.generation, "dirty": self.dirty});
        }
        // A window reopened for its unsaved work saves beside the file it came from (an imported web page included).
        if let Some(origin) = &self.origin {
            kept["origin"] = json!(origin.to_string_lossy());
        }
        // An untitled document reopened at a relaunch keeps its number, so the next new one is not given it again.
        if self.untitled > 0 {
            kept["untitled"] = json!(self.untitled);
        }
        let _ = std::fs::create_dir_all(file.parent().unwrap());
        let staged = file.with_extension("json.new");
        let written = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(&staged)
            .and_then(|mut f| f.write_all(kept.to_string().as_bytes()));
        if written.is_ok() {
            let _ = std::fs::rename(&staged, &file);
        }
    }

    /// Every window that held unsaved work when Rapier last closed, with its bound file.
    fn unsaved_windows() -> Vec<(u32, String)> {
        let folder = crate::instance_dir();
        let mut slots: Vec<(u32, String)> = std::fs::read_dir(&folder).into_iter().flatten().flatten()
            .filter_map(|e| e.file_name().to_str()?.strip_prefix("window-")?.strip_suffix(".json")?.parse::<u32>().ok())
            .filter(|n| *n > 0)
            .filter_map(|n| {
                let kept = serde_json::from_slice::<Value>(&std::fs::read(folder.join(format!("window-{n}.json"))).ok()?).ok()?;
                (kept["dirty"] == json!(true)).then(|| (n, str_of(&kept, "path")))
            })
            .collect();
        slots.sort_unstable();
        slots
    }

    fn restore_binding(&mut self) {
        let kept = std::fs::read(self.binding_file()).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok());
        self.origin = kept.as_ref().map(|k| PathBuf::from(str_of(k, "origin"))).filter(|o| o.is_absolute() && o.is_dir());
        self.untitled = kept.as_ref().and_then(|k| k["untitled"].as_u64()).map_or(0, |n| n as u32);
        self.current = kept
            .map(|k| Bound { path: str_of(&k, "path"), authority: str_of(&k, "authority"), generation: str_of(&k, "generation") })
            .filter(|b| !b.authority.is_empty() && Path::new(&b.path).is_absolute() && Path::new(&b.path).is_file());
    }

    fn start(&mut self, receiver: &Receiver<Event>) -> Result<(), String> {
        let id = self.cdp("Target.getTargets", json!({}), false);
        let targets = self.wait(receiver, id)?;
        self.target = targets["targetInfos"]
            .as_array()
            .and_then(|list| list.iter().find(|t| t["type"] == "page"))
            .map(|t| str_of(t, "targetId"))
            .ok_or("no page")?;
        let id = self.cdp(
            "Target.attachToTarget",
            json!({"targetId": self.target, "flatten": true}),
            false,
        );
        self.session = Some(str_of(&self.wait(receiver, id)?, "sessionId"));
        let id = self.cdp(
            "Target.setDiscoverTargets",
            json!({"discover": true}),
            false,
        );
        self.wait(receiver, id)?;
        self.read_theme();
        self.restore_binding();
        self.prepare_window(receiver)?;
        let sender = self.events.clone();
        let dark = self.events.clone();
        portal::watch_desktop(move |setting| { let _ = dark.send(Event::Desktop(setting)); });
        // On Omarchy the theme-set and font-set hooks tell rapier (payload::install); elsewhere the files are watched.
        let hooked = crate::payload::omarchy_hooks().iter().all(|hook| hook.is_file());
        std::thread::spawn(move || {
            if hooked {
                return;
            }
            let mut seen = theme::signature();
            loop {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let now = theme::signature();
                if now != seen {
                    seen = now;
                    if sender.send(Event::Theme).is_err() {
                        return;
                    }
                }
            }
        });
        let id = self.cdp(
            "Browser.setDownloadBehavior",
            json!({"behavior": "deny"}),
            false,
        );
        self.wait(receiver, id)?;
        let view = self.first_view.take();
        self.show_page(receiver, view.as_deref())
    }

    /// Load the page in the served window, on one of its views when asked (`#v/<view>`, which the page reads once at its
    /// birth). A window already at PAGE takes PAGE#v/<view> as a jump within the page; Page.navigatedWithinDocument then
    /// reloads it (on_cdp), so the page is born with the fragment. Nothing waits here: the load's requests need serving.
    fn show_page(&mut self, _receiver: &Receiver<Event>, view: Option<&str>) -> Result<(), String> {
        let url = match view {
            Some(view) => {
                self.view_jumps.push(self.target.clone());
                format!("{PAGE}#v/{view}")
            }
            None => PAGE.to_string(),
        };
        self.cdp("Page.navigate", json!({"url": url}), true);
        Ok(())
    }

    /// Err when the browser never showed the page: the person is told, and rapier exits 1 (never 0 with no window).
    pub fn run(&mut self, receiver: Receiver<Event>) -> Result<(), String> {
        if let Err(error) = self.start(&receiver) {
            let _ = self.browser.kill();
            return Err(format!("the browser did not open Rapier's window ({error})."));
        }
        // Each further document given at launch opens in a window of its own.
        for _ in 0..self.waiting_paths.len() {
            self.spawn_window();
        }
        loop {
            let event = match self.deferred.pop_front() {
                Some(event) => event,
                None => match self.next_event(&receiver) {
                    Ok(Some(event)) => event,
                    Ok(None) => return Ok(()),
                    Err(launch) => {
                        let _ = self.browser.kill();
                        return Err(launch + ".");
                    }
                },
            };
            match event {
                Event::Exit => return Ok(()),
                Event::Quit => {
                    // Gracefully, so the browser finishes what the windows wrote; a browser that does not go in four seconds is stopped.
                    self.cdp("Browser.close", json!({}), false);
                    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(4);
                    while self.browser.try_wait().ok().flatten().is_none() {
                        if std::time::Instant::now() > deadline {
                            let _ = self.browser.kill();
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(50));
                    }
                    return Ok(());
                }
                Event::Cdp(message) => self.on_cdp(message),
                Event::Theme => self.apply_theme(),
                Event::Desktop(setting) => self.apply_desktop(setting),
                Event::Open(path) if path == crate::THEME_CHANGED => self.apply_theme(),
                Event::Open(path) if path == crate::FOCUS => {
                    self.cdp("Target.activateTarget", json!({"targetId": self.target}), false);
                }
                Event::Open(path) => self.open_path(path),
                Event::Picked(id, result) => self.on_picked(id, result),
            }
            while let Some(target) = self.new_windows.pop_front() {
                if let Err(error) = self.adopt(&receiver, target) {
                    eprintln!("Rapier: a new window did not start: {error}");
                }
            }
        }
    }

    fn on_cdp(&mut self, message: Value) {
        let method = str_of(&message, "method");
        let params = message.get("params").cloned().unwrap_or(json!({}));
        // A window's own messages carry its session: serve that window. A session no window holds is not ours.
        if let Some(session) = message.get("sessionId").and_then(Value::as_str) {
            if !self.swap_to(session) {
                return;
            }
        }
        if let Some(id) = message.get("id").and_then(Value::as_u64) {
            if let Some(index) = self.theme_adds.iter().position(|&x| x == id) {
                let identifier = message
                    .pointer("/result/identifier")
                    .and_then(Value::as_str)
                    .map(String::from);
                if Some(&id) == self.theme_adds.last() {
                    self.theme_script = identifier;
                } else if let Some(identifier) = identifier {
                    self.cdp(
                        "Page.removeScriptToEvaluateOnNewDocument",
                        json!({"identifier": identifier}),
                        true,
                    );
                }
                self.theme_adds.remove(index);
            }
            return;
        }
        match method.as_str() {
            "Fetch.requestPaused" => self.serve(&params),
            "Inspector.targetCrashed" if !self.recovering => {
                self.recovering = true;
                self.page_ready = false;
                self.intake_ready = false;
                self.context = None;
                self.close_folder();
                // A transfer not yet ended has written no file. The page's
                // durable recovery precedes every save transfer.
                self.transfer = None;
                // Acceptance can precede the page's clear. Replay still needs
                // the exact native candidate to retain its overwrite authority.
                if self.candidate.is_none() {
                    if let (Some(intake), Some(bound)) = (&self.intake, &self.current) {
                        if intake.sent_end && str_of(&intake.begin, "purpose") != "compare"
                            && intake.begin.get("path") == Some(&json!(bound.path))
                            && intake.begin.get("documentAuthority") == Some(&json!(files::authority_for(&bound.path)))
                            && intake.begin.get("fileGeneration") == Some(&json!(bound.generation)) {
                            let mut candidate = bound.clone();
                            candidate.authority = str_of(&intake.begin, "documentAuthority");
                            self.candidate = Some(Candidate { id: intake.id, bound: candidate });
                        }
                    }
                }
                if let Some(intake) = &mut self.intake {
                    intake.restart = true;
                    intake.sent_end = false;
                    intake.offset = 0;
                    intake.sequence = 0;
                    intake.frame = crate::random_hex(16);
                    self.delivery += 1;
                    intake.delivery = self.delivery;
                    intake.begin["generation"] = json!(intake.frame);
                    intake.begin["deliveryGeneration"] = json!(intake.delivery);
                }
                self.cdp("Page.reload", json!({}), true);
            }
            // A view asked of a window already at PAGE (show_page): the jump to PAGE#v/<view> is reloaded so the page is born
            // with it. A load that arrived with the fragment needs nothing. The page's own later #v/notes is no jump of ours.
            "Page.navigatedWithinDocument" | "Page.frameNavigated" => {
                let frame = if method == "Page.frameNavigated" { &params["frame"] } else { &params };
                // A committed load names its fragment apart from its url (urlFragment); a jump within the page has it in the url.
                let url = format!("{}{}", frame.get("url").and_then(Value::as_str).unwrap_or(""), frame.get("urlFragment").and_then(Value::as_str).unwrap_or(""));
                let at = self.view_jumps.iter().position(|t| *t == self.target);
                if frame.get("id").or(frame.get("frameId")) == Some(&json!(self.target)) && url.starts_with(&format!("{PAGE}#v/")) {
                    if let Some(at) = at {
                        self.view_jumps.swap_remove(at);
                        if method == "Page.navigatedWithinDocument" {
                            self.cdp("Page.reload", json!({}), true);
                        }
                    }
                }
            }
            "Runtime.executionContextCreated" => {
                let context = &params["context"];
                if context.pointer("/auxData/isDefault") == Some(&json!(true))
                    && context.pointer("/auxData/frameId") == Some(&json!(self.target))
                    && context.get("origin") == Some(&json!(ORIGIN))
                {
                    self.context = context["id"].as_i64();
                    self.page_ready = false;
                    self.intake_ready = false;
                }
            }
            "Runtime.executionContextsCleared" => {
                self.context = None;
                self.close_folder();
            }
            "Runtime.bindingCalled" => {
                let payload = str_of(&params, "payload");
                if params["name"] == "__rapierLinux"
                    && params["executionContextId"].as_i64() == self.context
                    && self.context.is_some()
                    && payload.len() <= MAX_MESSAGE
                {
                    self.on_page(&payload);
                }
            }
            "Target.detachedFromTarget" => self.forget_window(&str_of(&params, "sessionId")),
            "Target.targetCreated" => {
                let info = &params["targetInfo"];
                let opener = str_of(info, "openerId");
                let ours = opener == self.target || self.others.iter().any(|w| w.target == opener);
                // An app window the browser opened at rapier's request (spawn_window) is attached in run().
                let target = str_of(info, "targetId");
                let known = target == self.target || self.others.iter().any(|w| w.target == target) || self.new_windows.contains(&target);
                if info["type"] == "page" && opener.is_empty() && !known && self.new_windows.len() < self.waiting_paths.len() {
                    self.new_windows.push_back(target);
                }
                // A new window from the page opens in the person's browser, never inside the app.
                else if info["type"] == "page" && !opener.is_empty() && ours {
                    self.cdp(
                        "Target.closeTarget",
                        json!({"targetId": info["targetId"]}),
                        false,
                    );
                    self.open_external(&str_of(info, "url"));
                }
            }
            _ => {}
        }
    }

    /// Where a file chooser opens: beside the open file, else the last folder chosen (kept across launches), else Documents
    /// (never the process's working directory).
    fn start_folder(&self) -> PathBuf {
        if let Some(folder) = self.beside() {
            return folder;
        }
        std::fs::read_to_string(crate::data_dir().join("rapier/last-folder"))
            .ok()
            .map(|text| PathBuf::from(text.trim_end_matches('\n')))
            .filter(|path| path.is_absolute() && path.is_dir())
            .unwrap_or_else(|| Some(files::documents_dir()).filter(|d| d.is_dir()).unwrap_or_else(crate::home))
    }

    /// Where a file goes without asking (one rule): beside the file this window opened or saved last
    /// (`origin`, a web page it imported included), else beside the bound file, else Documents. A binding kept from an
    /// earlier launch never outranks the file just opened.
    fn beside(&self) -> Option<PathBuf> {
        self.origin.clone()
            .or_else(|| self.current.as_ref().and_then(|c| Path::new(&c.path).parent().map(Path::to_path_buf)))
            .filter(|folder| folder.is_dir())
    }

    /// The folder a person just chose in, for the next chooser.
    fn remember_folder(&self, chosen: &str, is_folder: bool) {
        let path = Path::new(chosen);
        let folder = if is_folder { Some(path) } else { path.parent() };
        if let Some(folder) = folder.filter(|f| f.is_absolute()) {
            let file = crate::data_dir().join("rapier/last-folder");
            let _ = std::fs::create_dir_all(file.parent().unwrap());
            let _ = std::fs::write(file, folder.to_string_lossy().as_bytes());
        }
    }

    /// A window is at most 85% of the screen's work area each way, so its frame and the windows cascaded after it stay on
    /// the screen (945 x 1136 on a 1920 x 1200 screen put the second window's toolbar below the edge). The page reports
    /// the area and the window's size once it has loaded (ADAPTER). A tiling compositor sizes windows itself.
    fn fit_window(&mut self, sizes: &Value) {
        let number = |key: &str| sizes[key].as_i64();
        let (Some(window_id), Some(left), Some(top), Some(width), Some(height), Some(outer_width), Some(outer_height)) = (self.window_id,
            number("left"), number("top"), number("width"), number("height"), number("outerWidth"), number("outerHeight"))
        else {
            return;
        };
        if width < 320 || height < 240 {
            return;
        }
        self.area = Some((left, top, width, height));
        // Room for three cascade steps and the window manager's frame, so a smaller screen still steps down as well.
        let (fit_width, fit_height) = (outer_width.min(width * 85 / 100).min(width - 16 - 3 * 32),
            outer_height.min(height * 85 / 100).min(height - 64 - 3 * 32));
        if tiling() || (fit_width == outer_width && fit_height == outer_height) {
            return;
        }
        self.cdp("Browser.setWindowBounds",
            json!({"windowId": window_id, "bounds": {"windowState": "normal", "width": fit_width, "height": fit_height}}), false);
    }

    // -- Omarchy ------------------------------------------------------------------------------------------------------
    /// Give the page the person's Omarchy theme and font, at start and after each switch.
    /// The Omarchy theme changed (or was read at start): every window takes it.
    fn apply_theme(&mut self) {
        if !self.read_theme() {
            return;
        }
        self.theme_to_window();
        for _ in 0..self.others.len() {
            let mut w = self.others.remove(0);
            self.exchange(&mut w);
            self.theme_to_window();
            self.exchange(&mut w);
            self.others.push(w);
        }
    }

    /// The media features this window is given: Omarchy's light or dark, else the desktop's (the page follows its dark setting as the
    /// website follows the system's; light is said only to undo a dark this window was given), and the desktop's high contrast as a
    /// browser follows Windows High Contrast (forced-colors and prefers-contrast; undone the same way). One call, since each replaces the last.
    fn media_to_window(&mut self) {
        let mut features: Vec<Value> = Vec::new();
        let scheme = match theme::palette() {
            Some(p) => Some(p.mode),
            None => match self.desktop_dark {
                Some(true) => Some("dark".to_string()),
                Some(false) if self.dark_emulated => Some("light".to_string()),
                _ => None,
            },
        };
        if let Some(value) = scheme {
            features.push(json!({"name": "prefers-color-scheme", "value": value}));
        }
        if self.high_contrast {
            features.push(json!({"name": "forced-colors", "value": "active"}));
            features.push(json!({"name": "prefers-contrast", "value": "more"}));
        } else if self.contrast_emulated {
            features.push(json!({"name": "forced-colors", "value": "none"}));
            features.push(json!({"name": "prefers-contrast", "value": "no-preference"}));
        }
        if !features.is_empty() {
            self.cdp("Emulation.setEmulatedMedia", json!({"features": features}), true);
        }
    }

    /// The desktop's look was learned or changed: every window takes it at once.
    fn apply_desktop(&mut self, setting: portal::Desktop) {
        match setting {
            portal::Desktop::Dark(dark) if self.desktop_dark != Some(dark) => self.desktop_dark = Some(dark),
            portal::Desktop::Contrast(more) if self.high_contrast != more => self.high_contrast = more,
            _ => return,
        }
        self.media_to_window();
        for _ in 0..self.others.len() {
            let mut w = self.others.remove(0);
            self.exchange(&mut w);
            self.media_to_window();
            self.exchange(&mut w);
            self.others.push(w);
        }
        self.dark_emulated |= self.desktop_dark == Some(true);
        self.contrast_emulated |= self.high_contrast;
    }

    /// Read the theme and font; true when they differ from what the windows have.
    fn read_theme(&mut self) -> bool {
        let mut palette = theme::palette();
        if palette.is_none() {
            if let Some((last, _)) = &self.theme {
                palette = last.clone(); // a switch replaces the theme folder: keep the last theme meanwhile
            }
        }
        let css = theme::css(palette.as_ref(), &theme::font());
        let next = (palette, css);
        if self.theme.as_ref() == Some(&next) || (self.theme.is_none() && next.1.is_empty()) {
            return false;
        }
        self.theme = Some(next);
        true
    }

    /// Give the window being served the current theme, now and on every load.
    fn theme_to_window(&mut self) {
        let Some((_, css)) = self.theme.clone() else {
            return;
        };
        // rapier's System theme follows the media query, so it follows Omarchy's light or dark (media_to_window).
        self.media_to_window();
        let source = format!(
            "globalThis.__rapierLinuxTheme && globalThis.__rapierLinuxTheme({})",
            json!(css)
        );
        if let Some(identifier) = self.theme_script.take() {
            self.cdp(
                "Page.removeScriptToEvaluateOnNewDocument",
                json!({"identifier": identifier}),
                true,
            );
        }
        let id = self.cdp(
            "Page.addScriptToEvaluateOnNewDocument",
            json!({"source": source}),
            true,
        );
        self.theme_adds.push(id);
        if let Some(context) = self.context {
            self.cdp(
                "Runtime.evaluate",
                json!({"expression": source, "contextId": context}),
                true,
            );
        }
    }

    fn plugin_path(&self, resource: &str) -> Option<PathBuf> {
        let valid = !resource.is_empty()
            && resource.len() <= 160
            && !resource.starts_with('.')
            && resource
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c));
        valid.then(|| self.app.join("plugins").join(resource))
    }

    fn serve(&mut self, params: &Value) {
        let request = params["requestId"].clone();
        let url = params
            .pointer("/request/url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let Some(rest) = url.strip_prefix(&format!("{ORIGIN}/")) else {
            // Everything else goes to the network, which the dead proxy refuses unless --online.
            self.cdp("Fetch.continueRequest", json!({"requestId": request}), true);
            return;
        };
        let name = rest.split(['?', '#']).next().unwrap_or("").to_string();
        // The page and its files at the top, the parts in parts/ beside it, the plug-ins under plugins/.
        let plain = |file: &str| !file.is_empty() && !file.contains('/') && !file.starts_with('.');
        let path = match (name.strip_prefix("plugins/"), name.strip_prefix("parts/")) {
            (Some(resource), _) => self.plugin_path(resource),
            (None, Some(part)) => plain(part).then(|| self.app.join("parts").join(part)),
            // The page's icons are rapier's own (the window and taskbar show it, not a globe).
            (None, None) if name == "icon-192.png" || name == "icon-512.png" => Some(self.app.join("rapier.png")),
            (None, None) => plain(&name).then(|| self.app.join(&name)),
        };
        match path
            .filter(|p| p.is_file())
            .and_then(|p| std::fs::read(p).ok())
        {
            Some(body) => {
                self.cdp("Fetch.fulfillRequest", json!({"requestId": request, "responseCode": 200, "body": B64.encode(body),
                    "responseHeaders": [{"name": "Content-Type", "value": content_type(&name)}, {"name": "Cache-Control", "value": "no-store"}]}), true);
            }
            None => {
                self.cdp(
                    "Fetch.fulfillRequest",
                    json!({"requestId": request, "responseCode": 404, "body": ""}),
                    true,
                );
            }
        }
    }

    fn post(&mut self, channel: &str, payload: Value) {
        let Some(context) = self.context else { return };
        let payload = match payload {
            Value::String(s) => s,
            other => other.to_string(),
        };
        let outer = json!({"channel": channel, "payload": payload});
        self.cdp("Runtime.evaluate", json!({"expression": format!("globalThis.__rapierLinuxDeliver({outer})"), "contextId": context}), true);
    }

    fn respond(&mut self, ident: &str, ok: bool, result: Value, error: &str) {
        let mut message = json!({"type": "response", "id": ident, "ok": ok});
        if ok {
            message["result"] = if result.is_null() { json!({}) } else { result };
        } else {
            message["error"] = json!(if error.is_empty() {
                "native operation failed"
            } else {
                error
            });
        }
        self.post("host", message);
    }

    fn ok(&mut self, ident: &str, result: Value) {
        self.respond(ident, true, result, "");
    }

    fn event(&mut self, name: &str, detail: Value) {
        self.post(
            "host",
            json!({"type": "event", "event": name, "detail": detail}),
        );
    }

    fn notify_linked_windows(&mut self, path: &str, generation: &str) {
        let Ok(saved) = std::fs::metadata(path) else { return };
        for _ in 0..self.others.len() {
            let mut window = self.others.remove(0);
            self.exchange(&mut window);
            if let Some(bound) = self.current.clone().filter(|bound| bound.generation != generation) {
                if std::fs::metadata(&bound.path).is_ok_and(|other| other.dev() == saved.dev() && other.ino() == saved.ino()) {
                    self.event("file.changed", json!({"path": bound.path, "documentAuthority": bound.authority, "fileGeneration": generation}));
                }
            }
            self.exchange(&mut window);
            self.others.push(window);
        }
    }

    // -- the page's messages ------------------------------------------------------------------------------------------
    fn on_page(&mut self, raw: &str) {
        let Ok(outer) = serde_json::from_str::<Value>(raw) else {
            return;
        };
        let channel = str_of(&outer, "channel");
        let Ok(inner) = serde_json::from_str::<Value>(&str_of(&outer, "payload")) else {
            return;
        };
        if channel == "intake" {
            self.on_intake(&inner);
        } else if channel == "window" {
            self.fit_window(&inner);
        } else if channel == "host" && inner.is_object() {
            if inner.get("v").is_some() || inner.get("op").is_some() {
                self.on_frame(&inner);
            } else {
                let ident = str_of(&inner, "id");
                let args = inner
                    .get("arguments")
                    .filter(|a| a.is_object())
                    .cloned()
                    .unwrap_or(json!({}));
                if let Err(error) = self.on_request(&ident, &str_of(&inner, "operation"), &args) {
                    self.respond(
                        &ident,
                        false,
                        Value::Null,
                        if error.is_empty() {
                            "native operation failed"
                        } else {
                            &error
                        },
                    );
                }
            }
        }
    }

    pub fn close_folder(&mut self) {
        self.folder = None;
    }

    fn open_folder(&self, root: &str) -> Result<Folder, String> {
        Ok(Folder {
            token: crate::random_hex(24),
            broker: Broker::open(root)?,
        })
    }

    fn on_request(&mut self, ident: &str, op: &str, args: &Value) -> Result<(), String> {
        if ident.is_empty() || ident.len() > 160 || op.is_empty() {
            return Ok(());
        }
        let authority = str_of(args, "documentAuthority");
        match op {
            "platform.state" => {
                let mut capabilities = CAPABILITIES.iter().map(|c| (c.to_string(), json!(true))).collect::<Map<_, _>>();
                // Offline (the default), the page hides what needs the network: Share's live document, Notes' Sync.
                if self.online {
                    capabilities.insert("network".to_string(), json!(true));
                }
                let mut state = json!({"platformId": "linux", "capabilities": capabilities,
                    "recents": recents_state(), "pendingIntake": self.intake.is_some() || self.candidate.is_some() || !self.pending_paths.is_empty(),
                    "currentFileBound": self.current.is_some(), "installation": {"state": "standalone", "installed": true},
                    // A relaunch reopens the document where the person left it, as a desktop editor does: no RESUME
                    // POSITION? offer beside the last-edited notice.
                    "recoveryAutoResume": true});
                if let Some(current) = &self.current {
                    state["currentFileAuthority"] = json!(current.authority);
                    state["currentFileGeneration"] = json!(current.generation);
                }
                self.ok(ident, state);
                self.prime();
            }
            "page.ready" => {
                self.page_ready = true;
                self.recovering = false;
                self.label_window();
                self.launch_deadline = None;
                if let (Some((left, top)), Some(window)) = (self.cascade_to.take(), self.window_id) {
                    self.cdp("Browser.setWindowBounds", json!({"windowId": window, "bounds": {"left": left, "top": top}}), false);
                }
                self.ok(ident, json!({}));
                for message in self.receipts.clone().into_iter().map(|(_, m)| m) {
                    self.post("host", message);
                }
                self.pump();
            }
            "save.choose" => {
                if self.holding().opening { return Err("a document is still opening".into()); }
                let folder = self.start_folder();
                let name = free_copy_name(&folder, &str_of(args, "name"));
                self.start_pick(Pick::SaveName { ident: ident.to_string(), name: str_of(args, "name") }, true, &name, "Save as", false, folder);
            }
            "folder.choose" => {
                let start = self.start_folder();
                self.start_pick(Pick::Folder { ident: ident.to_string() }, false, "", "Open", true, start);
            }
            "folder.call" | "folder.close" => {
                if self.folder.as_ref().map(|f| f.token.as_str())
                    != Some(str_of(args, "token").as_str())
                    || str_of(args, "token").is_empty()
                {
                    self.ok(ident, json!({"error": "revoked"}));
                    return Ok(());
                }
                if op == "folder.close" {
                    self.close_folder();
                    self.ok(ident, json!(true));
                    return Ok(());
                }
                if args.to_string().len() > 16384 {
                    self.ok(ident, json!({"error": "request_limit"}));
                    return Ok(());
                }
                let call_args = args
                    .get("args")
                    .filter(|a| a.is_object())
                    .cloned()
                    .unwrap_or(json!({}));
                let reply = self
                    .folder
                    .as_mut()
                    .unwrap()
                    .call(&str_of(args, "method"), &call_args);
                match reply {
                    Ok(value) => self.ok(ident, json!({"value": value})),
                    Err(code) => self.ok(ident, json!({"error": code})),
                }
            }
            "file.open" => {
                let compare = str_of(args, "purpose") == "compare";
                let start = self.start_folder();
                self.start_pick(Pick::Open { ident: ident.to_string(), compare }, false, "", if compare { "Compare with" } else { "Open" }, false, start);
            }
            "file.readCurrent" => {
                let current = self
                    .current
                    .clone()
                    .filter(|c| c.authority == authority)
                    .ok_or("the current document authority changed")?;
                self.begin_intake(&current.path, "read-current")
                    .map_err(|e| e.to_string())?;
                self.ok(ident, json!({"started": true}));
            }
            "file.checkExternal" => {
                let current = self
                    .current
                    .clone()
                    .filter(|c| c.authority == authority)
                    .ok_or("the document authority changed")?;
                let actual = files::generation_of(&current.path);
                if !actual.is_empty() && actual != current.generation {
                    self.event("file.changed", json!({"path": current.path, "documentAuthority": current.authority, "fileGeneration": actual}));
                }
                self.ok(ident, json!({"checked": true}));
            }
            "document.acceptOpened" => {
                let candidate = self
                    .candidate
                    .as_ref()
                    .ok_or("opened document does not match native intake authority")?;
                let path = files::normalize(
                    &std::env::current_dir()
                        .unwrap_or_default()
                        .join(str_of(args, "path")),
                )
                .to_string_lossy()
                .into_owned();
                if args.get("intakeId") != Some(&json!(candidate.id))
                    || path != candidate.bound.path
                    || str_of(args, "nativeDocumentAuthority") != candidate.bound.authority
                    || authority.is_empty()
                    || str_of(args, "fileGeneration") != candidate.bound.generation
                {
                    return Err("opened document does not match native intake authority".into());
                }
                let mut bound = self.candidate.take().unwrap().bound;
                if files::generation_of(&bound.path) != bound.generation {
                    self.pump();
                    return Err(
                        "opened file changed or became unavailable before acceptance".into(),
                    );
                }
                // The intake owns the file; the admitted history owns subsequent save receipts.
                bound.authority = authority;
                self.origin = Path::new(&bound.path).parent().map(Path::to_path_buf);
                self.current = Some(bound);
                self.keep_binding();
                self.label_window();
                self.ok(ident, json!({"bound": true}));
                self.pump();
            }
            "document.detach" => {
                if authority.is_empty()
                    || self
                        .current
                        .as_ref()
                        .map(|c| c.authority == authority)
                        .unwrap_or(false)
                {
                    self.current = None;
                    self.keep_binding();
                    self.label_window();
                }
                self.ok(ident, json!({}));
            }
            "intake.clear" => {
                let id = args.get("intakeId").and_then(Value::as_u64);
                if id.is_none() || self.intake.as_ref().is_some_and(|row| Some(row.id) == id) {
                    self.intake = None;
                }
                if id.is_none() || self.candidate.as_ref().is_some_and(|row| Some(row.id) == id) {
                    self.candidate = None;
                }
                self.ok(ident, json!({}));
                self.pump();
            }
            "document.ackSaveResult" => {
                let key = (
                    str_of(args, "requestId"),
                    str_of(args, "payloadDigest").to_lowercase(),
                );
                self.receipts.retain(|(k, _)| *k != key);
                self.ok(ident, json!({"acknowledged": true}));
            }
            "transfer.begin" => {
                let result = self.begin_transfer(args)?;
                self.ok(ident, result);
            }
            "transfer.end" => {
                let result = self.finish_transfer(args)?;
                self.ok(ident, result);
            }
            "transfer.cancel" => {
                let cancelled = self
                    .transfer
                    .as_ref()
                    .map(|t| t.request_id == str_of(args, "requestId"))
                    .unwrap_or(false);
                if cancelled {
                    let session = self.transfer.take().unwrap();
                    self.save_result(
                        &session,
                        "failed",
                        false,
                        "the page canceled the unfinished transfer",
                        "",
                        "",
                        false,
                        false,
                        "",
                    );
                }
                self.ok(ident, json!({"cancelled": cancelled, "inFlight": false}));
            }
            "resources.status" | "resources.ensure" => {
                let resource = str_of(args, "id");
                // The PDF reader is a set of files; its own id names the set, as on Windows.
                let held = resource == "rapier-pdf"
                    || self
                        .plugin_path(&resource)
                        .map(|p| p.is_file())
                        .unwrap_or(false);
                if op == "resources.ensure" && !held {
                    return Err(format!(
                        "this plug-in is not in the installed package: {resource}"
                    ));
                }
                self.ok(
                    ident,
                    json!({"status": if held { "ready" } else { "error" }}),
                );
            }
            "external.open" => {
                if !self.open_external(&str_of(args, "url")) {
                    return Err("external URL is not allowed".into());
                }
                self.ok(ident, json!({}));
            }
            "document.dirty" => {
                let dirty = args.get("dirty") == Some(&json!(true));
                if dirty != self.dirty {
                    self.dirty = dirty;
                    self.keep_binding();
                }
                self.ok(ident, json!({}));
            }
            "app.quit" => {
                self.ok(ident, json!({}));
                self.quit_all();
            }
            "app.quitKept" => {
                if self.quit_waiting > 0 {
                    self.quit_waiting -= 1;
                    if self.quit_waiting == 0 {
                        let _ = self.events.send(Event::Quit);
                    }
                }
            }
            "window.new" => {
                // New from the page (Ctrl+N): a window of its own unless this one is untouched and empty, where the page
                // starts it itself.
                // The host names every new document, here too, so no two windows share a name.
                if goes_to(self.holding(), Route::NewDocument) == Place::OwnWindow {
                    self.waiting_paths.push_back(crate::NEW_DOCUMENT.to_string());
                    self.spawn_window();
                } else {
                    self.begin_text(Vec::new(), None).map_err(|e| e.to_string())?;
                }
                self.ok(ident, json!({"opened": true}));
            }
            "recent.note" => {
                let path = str_of(args, "path");
                let bound = self.current.as_ref().is_some_and(|c| c.authority == authority && c.path == path);
                if !bound {
                    self.respond(ident, false, Value::Null, "only the bound document can enter the recent files list");
                } else if let Err(error) = note_recent(&path) {
                    self.respond(ident, false, Value::Null, &error.to_string());
                } else {
                    self.ok(ident, json!({}));
                }
            }
            "recent.open" => {
                let path = str_of(args, "path");
                if read_recents().iter().any(|p| *p == path) {
                    self.open_path(path);
                    self.ok(ident, json!({}));
                } else {
                    self.respond(ident, false, Value::Null, "the path is not a recorded recent file");
                }
            }
            "document.title" | "window.theme" => self.ok(ident, json!({})),
            _ => self.respond(ident, false, Value::Null, "unsupported operation"),
        }
        Ok(())
    }

    fn on_frame(&mut self, frame: &Value) {
        let op = frame.get("op").cloned().unwrap_or(Value::Null);
        let rid = frame.get("requestId").cloned().unwrap_or(Value::Null);
        let generation = frame.get("generation").cloned().unwrap_or(Value::Null);
        let meta = frame.get("meta").cloned().unwrap_or(json!({}));
        let answer = |host: &mut Host, ok: bool, result: Value, error: &str, refused: &str| {
            let mut reply = json!({"ok": ok});
            if ok {
                reply["result"] = result;
            } else {
                reply["error"] = json!(error);
            }
            if !refused.is_empty() {
                reply["refused"] = json!(refused);
            }
            host.post("host", json!({"v": 1, "op": op, "requestId": rid, "generation": generation, "meta": reply}));
        };
        if frame.get("v") != Some(&json!(1)) {
            return answer(
                self,
                false,
                Value::Null,
                "The native frame was refused: version",
                "version",
            );
        }
        if frame.get("op") != Some(&json!("transfer.chunk")) {
            return answer(self, false, Value::Null, "unsupported operation", "");
        }
        let valid_generation = self
            .transfer
            .as_ref()
            .map(|t| Some(&json!(t.frame)) == frame.get("generation"))
            .unwrap_or(false);
        if !valid_generation {
            return answer(
                self,
                false,
                Value::Null,
                "The native frame was refused: generation",
                "generation",
            );
        }
        let data = B64.decode(str_of(frame, "bytes")).unwrap_or_default();
        let session = self.transfer.as_mut().unwrap();
        if meta.get("requestId") != Some(&json!(session.request_id))
            || meta.get("sequence") != Some(&json!(session.sequence))
            || data.is_empty()
            || data.len() > CHUNK
            || session.bytes.len() + data.len() > session.length
        {
            return answer(
                self,
                false,
                Value::Null,
                "invalid transfer chunk",
                "malformed",
            );
        }
        session.bytes.extend_from_slice(&data);
        session.sequence += 1;
        let received = session.bytes.len();
        answer(
            self,
            true,
            json!({"sequence": meta["sequence"], "received": received}),
            "",
            "",
        );
    }

    fn on_intake(&mut self, message: &Value) {
        if !message.is_object() {
            return;
        }
        if message.get("type") == Some(&json!("ready")) {
            self.intake_ready = true;
            if let Some(state) = &mut self.intake {
                if state.restart {
                    state.restart = false;
                    let begin = state.begin.clone();
                    self.post("intake", begin);
                    self.send_chunk();
                    return;
                }
            }
            return self.prime();
        }
        let Some(state) = &self.intake else { return };
        if message.get("v") != Some(&json!(1)) || message.get("op") != Some(&json!("intake.chunk"))
        {
            return;
        }
        if str_of(message, "requestId") != state.id.to_string()
            || message.get("generation") != Some(&json!(state.frame))
        {
            return;
        }
        let meta = message.get("meta").cloned().unwrap_or(json!({}));
        if meta.get("ok") != Some(&json!(true)) {
            self.intake = None;
            self.candidate = None;
            return self.pump();
        }
        if meta.pointer("/result/sequence") == Some(&json!(state.sequence)) {
            self.intake.as_mut().unwrap().sequence += 1;
            self.send_chunk();
        }
    }

    // -- opening ------------------------------------------------------------------------------------------------------
    /// A path from the command line waits for the intake channel, not for the editor.
    fn prime(&mut self) {
        if self.intake_ready && !self.page_ready {
            self.pump();
        }
    }

    fn pump(&mut self) {
        while self.intake_ready && self.intake.is_none() && self.candidate.is_none() {
            let Some(path) = self.pending_paths.pop_front() else {
                return;
            };
            match self.begin_intake(&path, "external") {
                Ok(()) => return,
                Err(error) => {
                    let message = error.to_string();
                    self.event(
                        "file.openFailed",
                        json!({"name": shown_name(&path), "error": message, "message": message}),
                    );
                }
            }
        }
    }

    /// A new document with no file behind it (`--new`, or text read from stdin with `rapier -`): Save asks where.
    fn begin_text(&mut self, data: Vec<u8>, origin: Option<PathBuf>) -> std::io::Result<()> {
        if self.intake.is_some() || self.candidate.is_some() {
            return Err(std::io::Error::other("another file open is already in progress"));
        }
        // An empty new document leaves the window free for the next one; text from stdin holds it.
        self.text_held = !data.is_empty();
        // The window now holds a document with no file: Save asks where, and a relaunch is not bound to the last file.
        self.current = None;
        self.origin = origin;
        self.keep_binding();
        self.label_window();
        // Two windows of new documents are told apart by their titles.
        self.untitled = (1..).find(|n| self.others.iter().all(|w| w.untitled != *n)).unwrap_or(1);
        let suffix = if std::str::from_utf8(&data).is_ok_and(|text| text.trim_start_matches('\u{feff}').trim_start().starts_with("<!DOCTYPE html") || text.trim_start_matches('\u{feff}').trim_start().starts_with("<!doctype html")) { "html" } else { "md" };
        let name = if self.untitled > 1 { format!("untitled {}.{suffix}", self.untitled) } else { format!("untitled.{suffix}") };
        // An empty new document is the page's own New, under this name: a document the host delivered with no file
        // behind it kept the page from opening a file into that window afterwards (Ctrl+O from a `--new` window).
        if data.is_empty() {
            self.event("document.new", json!({"name": name}));
            return Ok(());
        }
        self.intake_id += 1;
        self.delivery += 1;
        let frame = crate::random_hex(16);
        let begin = json!({"type": "begin", "id": self.intake_id, "deliveryGeneration": self.delivery, "generation": frame,
            "name": name, "path": null, "documentAuthority": "", "fileGeneration": null, "purpose": "external",
            "transient": true, "binary": false});
        self.post("intake", begin.clone());
        self.intake = Some(Intake { begin, sent_end: false, restart: false, id: self.intake_id, delivery: self.delivery, frame, bytes: data, offset: 0, sequence: 0,
            generation: String::new() });
        self.send_chunk();
        Ok(())
    }

    fn begin_intake(&mut self, path: &str, purpose: &str) -> std::io::Result<()> {
        if self.intake.is_some() || self.candidate.is_some() {
            return Err(std::io::Error::other(
                "another file open is already in progress",
            ));
        }
        if path == crate::NEW_DOCUMENT {
            return self.begin_text(Vec::new(), None);
        }
        if let Some(text) = path.strip_prefix(crate::STDIN_DOCUMENT) {
            // The text main() set aside from stdin, in a private file that is read once and removed.
            let input: Value = serde_json::from_str(text).map_err(std::io::Error::other)?;
            let file = input["path"].as_str().ok_or_else(|| std::io::Error::other("missing stdin file"))?;
            let origin = input["folder"].as_str().map(PathBuf::from).filter(|path| path.is_absolute() && path.is_dir());
            let data = std::fs::read(file)?;
            let _ = std::fs::remove_file(file);
            return self.begin_text(data, origin);
        }
        let path = files::normalize(&std::env::current_dir().unwrap_or_default().join(path))
            .to_string_lossy()
            .into_owned();
        // A file that does not exist yet opens empty under its name; the first save creates it.
        let (data, generation) = match files::read_snapshot(&path) {
            // A folder that does not exist yet either: the first save makes it.
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && purpose != "compare" => (Vec::new(), String::new()),
            read => read?,
        };
        if purpose != "compare" {
            self.untitled = 0;
            self.origin = Path::new(&path).parent().map(Path::to_path_buf);
            self.label_window();
        }
        self.intake_id += 1;
        self.delivery += 1;
        let frame = crate::random_hex(16);
        let authority = files::authority_for(&path);
        if purpose != "compare" {
            self.candidate = Some(Candidate {
                id: self.intake_id,
                bound: Bound {
                    path: path.clone(),
                    authority: authority.clone(),
                    generation: generation.clone(),
                },
            });
        }
        let binary =
            purpose != "compare" && BINARY.iter().any(|ext| path.to_lowercase().ends_with(ext));
        let begin = json!({"type": "begin", "id": self.intake_id, "deliveryGeneration": self.delivery, "generation": frame,
            "name": shown_name(&path), "path": path, "documentAuthority": authority, "fileGeneration": generation, "purpose": purpose, "binary": binary});
        self.post("intake", begin.clone());
        self.intake = Some(Intake {
            begin, sent_end: false, restart: false,
            id: self.intake_id,
            delivery: self.delivery,
            frame,
            bytes: data,
            offset: 0,
            sequence: 0,
            generation,
        });
        self.send_chunk();
        Ok(())
    }

    fn send_chunk(&mut self) {
        let Some(state) = self.intake.as_mut() else {
            return;
        };
        if state.offset >= state.bytes.len() {
            if state.sent_end { return; }
            let end = json!({"type": "end", "id": state.id, "deliveryGeneration": state.delivery, "fileGeneration": state.generation});
            // Keep the delivered bytes until the page admits or refuses this
            // intake. A renderer crash before that handoff replays these bytes.
            state.sent_end = true;
            return self.post("intake", end);
        }
        let end = (state.offset + CHUNK).min(state.bytes.len());
        let part = B64.encode(&state.bytes[state.offset..end]);
        state.offset = end;
        let message = json!({"v": 1, "op": "intake.chunk", "requestId": state.id.to_string(), "generation": state.frame,
            "meta": {"sequence": state.sequence}, "bytes": part});
        self.post("intake", message);
    }

    // -- saving -------------------------------------------------------------------------------------------------------
    fn begin_transfer(&mut self, args: &Value) -> Result<Value, String> {
        if self.holding().opening { return Err("a document is still opening".into()); }
        if self.transfer.is_some() {
            return Err("another transfer is active".into());
        }
        let purpose = str_of(args, "purpose");
        let length = args.get("payloadLength").and_then(Value::as_u64);
        let digest = str_of(args, "payloadDigest").to_lowercase();
        let request_id = str_of(args, "requestId");
        let Some(length) = length.filter(|&l| l <= files::MAX_DOCUMENT) else {
            return Err("unsupported transfer".into());
        };
        if !["saveAs", "saveInPlace", "export"].contains(&purpose.as_str())
            || digest.len() != 64
            || request_id.is_empty()
        {
            return Err("unsupported transfer".into());
        }
        let name = {
            let n = basename(&str_of(args, "name"));
            if n.is_empty() {
                "document.md".to_string()
            } else {
                n
            }
        };
        let frame = crate::random_hex(16);
        self.transfer = Some(Transfer {
            chosen: str_of(args, "chosenDestination"),
            request_id,
            purpose,
            name,
            authority: str_of(args, "documentAuthority"),
            document_generation: args.get("documentGeneration").cloned().unwrap_or(json!(0)),
            document_revision: args.get("documentRevision").cloned().unwrap_or(json!(0)),
            length: length as usize,
            digest,
            exclusive: args.get("exclusiveNewDestination") == Some(&json!(true)),
            file_generation: args.get("fileGeneration").cloned().unwrap_or(Value::Null),
            frame: frame.clone(),
            sequence: 0,
            bytes: Vec::new(),
        });
        Ok(json!({"chunkBytes": CHUNK, "generation": frame}))
    }

    fn finish_transfer(&mut self, args: &Value) -> Result<Value, String> {
        if self
            .transfer
            .as_ref()
            .map(|t| t.request_id != str_of(args, "requestId"))
            .unwrap_or(true)
        {
            return Err("transfer request does not match".into());
        }
        let session = self.transfer.take().unwrap();
        if session.purpose == "saveInPlace" {
            return self.complete_transfer(session, None, false);
        }
        // The chooser shows off the host's loop; the save finishes when it answers (complete_transfer) and the page hears
        // it as the save result.
        // The person already chose (save.choose): the bytes go there, and no second chooser opens.
        if !session.chosen.is_empty() {
            return match self.chosen_saves.remove(&session.chosen) {
                Some((path, unchosen)) => self.complete_transfer(session, Some(Ok(path)), unchosen),
                None => {
                    self.save_result(&session, "failed", false, "the chosen destination is no longer known", "", "", false, false, "");
                    Ok(json!({"accepted": true, "picker": true}))
                }
            };
        }
        let folder = self.start_folder();
        let name = free_copy_name(&folder, &session.name);
        self.start_pick(Pick::Save(session), true, &name, "Save as", false, folder);
        Ok(json!({"accepted": true, "picker": true}))
    }

    /// Show the desktop's file chooser on a thread of its own, so one window's open dialog never holds up the others;
    /// `on_picked` continues with its answer.
    fn start_pick(&mut self, what: Pick, save: bool, name: &str, title: &'static str, directory: bool, start: PathBuf) {
        self.next_pick += 1;
        let id = self.next_pick;
        self.picks.insert(id, (self.session.clone(), what));
        let events = self.events.clone();
        let name = name.to_string();
        // On X11 the chooser is made transient for this browser's window (on Wayland the parent is the browser's to export: "").
        let parent = if self.x11 { portal::x11_parent(self.browser.id()) } else { String::new() };
        std::thread::spawn(move || {
            let _ = events.send(Event::Picked(id, portal::pick(save, &name, title, directory, &start, &parent)));
        });
    }

    fn on_picked(&mut self, id: u64, result: Result<String, String>) {
        let Some((session, what)) = self.picks.remove(&id) else { return };
        // The window that asked closed while its chooser was up: nothing is waiting for the answer.
        let Some(session) = session else { return };
        if !self.swap_to(&session) {
            return;
        }
        match what {
            Pick::Open { ident, compare } => {
                if let Err(error) = self.file_chosen(&ident, compare, result) {
                    self.respond(&ident, false, Value::Null, &error);
                }
            }
            Pick::Folder { ident } => {
                if let Err(error) = self.folder_chosen(&ident, result) {
                    self.respond(&ident, false, Value::Null, &error);
                }
            }
            Pick::Save(transfer) => {
                let _ = self.complete_transfer(transfer, Some(result), false);
            }
            Pick::SaveName { ident, name } => self.name_chosen(&ident, &name, result),
        }
    }

    /// The answer to save.choose: where the document goes (a token the transfer names), or that the person canceled. With no file
    /// chooser on this desktop the copy goes beside the open file, as a save always did, and the page says where.
    fn name_chosen(&mut self, ident: &str, wanted: &str, result: Result<String, String>) {
        let (path, unchosen) = match result {
            Ok(path) if path.is_empty() => {
                self.ok(ident, json!({"cancelled": true}));
                return;
            }
            Ok(path) => {
                self.remember_folder(&path, false);
                (files::normalize(Path::new(&path)).to_string_lossy().into_owned(), false)
            }
            Err(reason) => {
                if reason != portal::NO_CHOOSER {
                    self.respond(ident, false, Value::Null, &reason);
                    return;
                }
                let folder = self.beside().unwrap_or_else(files::documents_dir);
                if std::fs::create_dir_all(&folder).is_err() {
                    let message = json!({"type": "response", "id": ident, "ok": false, "error": reason, "code": "no_file_chooser"});
                    self.post("host", message);
                    return;
                }
                self.saved_where = Some(files::shown(&folder));
                (files::unused_name(&folder, wanted).to_string_lossy().into_owned(), true)
            }
        };
        let token = crate::random_hex(16);
        let name = shown_name(&path);
        self.chosen_saves.insert(token.clone(), (path, unchosen));
        self.ok(ident, json!({"token": token, "name": name}));
    }

    fn folder_chosen(&mut self, ident: &str, result: Result<String, String>) -> Result<(), String> {
        let path = match result {
            Ok(path) => path,
            Err(reason) => {
                self.ok(ident, json!({"status": "unavailable", "provider": "linux", "reason": reason}));
                return Ok(());
            }
        };
        if path.is_empty() {
            self.ok(ident, json!({"cancelled": true}));
            return Ok(());
        }
        self.remember_folder(&path, true);
        match self.open_folder(&path).and_then(|mut folder| folder.call("hello", &json!({})).map(|hello| (folder, hello))) {
            Ok((folder, hello)) => {
                self.close_folder();
                let mut result = if hello.is_object() { hello } else { json!({}) };
                result["token"] = json!(folder.token);
                self.folder = Some(folder);
                self.ok(ident, result);
            }
            Err(reason) => self.ok(ident, json!({"status": "unavailable", "provider": "linux", "reason": reason})),
        }
        Ok(())
    }

    fn file_chosen(&mut self, ident: &str, compare: bool, result: Result<String, String>) -> Result<(), String> {
        let path = match result {
            Ok(path) => path,
            Err(reason) => {
                // The page names this case (no_file_chooser) instead of "could not open that file".
                let message = json!({"type": "response", "id": ident, "ok": false, "error": reason, "code": "no_file_chooser"});
                self.post("host", message);
                return Ok(());
            }
        };
        if path.is_empty() {
            self.ok(ident, json!({"cancelled": true}));
            return Ok(());
        }
        self.remember_folder(&path, false);
        if compare {
            self.begin_intake(&path, "compare").map_err(|e| e.to_string())?;
            self.ok(ident, json!({"started": true}));
        } else {
            // The chosen file opens as any other does (open_path): the page's own request has nothing to wait for.
            self.ok(ident, json!({"cancelled": true}));
            self.open_path(files::normalize(Path::new(&path)).to_string_lossy().into_owned());
        }
        Ok(())
    }

    /// The rest of a save: `pick` is the chooser's answer for a Save As (None for a save in place).
    fn complete_transfer(&mut self, session: Transfer, pick: Option<Result<String, String>>, forced_unchosen: bool) -> Result<Value, String> {
        let picked = pick.is_some();
        // No file chooser on this desktop (no xdg-desktop-portal): a person can still save. The copy goes beside the open
        // file, or into Documents, under a name nothing has, and the page says where.
        let mut unchosen = forced_unchosen;
        let destination = if let Some(pick) = pick {
            let chosen = match pick {
                Ok(chosen) => chosen,
                Err(reason) => {
                    if reason != portal::NO_CHOOSER {
                        self.save_result(&session, "failed", false, &reason, "", "", false, false, "");
                        return Ok(json!({"accepted": true, "picker": true}));
                    }
                    let folder = self.beside().unwrap_or_else(files::documents_dir);
                    if std::fs::create_dir_all(&folder).is_err() {
                        self.save_result(&session, "failed", false, &reason, "", "", false, false, "no_file_chooser");
                        return Ok(json!({"accepted": true, "picker": true}));
                    }
                    unchosen = true;
                    self.saved_where = Some(files::shown(&folder));
                    files::unused_name(&folder, &session.name).to_string_lossy().into_owned()
                }
            };
            if chosen.is_empty() {
                self.save_result(&session, "cancelled", false, "", "", "", false, false, "");
                return Ok(json!({"accepted": true, "picker": true}));
            }
            if !unchosen {
                self.remember_folder(&chosen, false);
            }
            chosen
        } else {
            match &self.current {
                Some(current) if current.authority == session.authority => current.path.clone(),
                _ => {
                    self.save_result(
                        &session,
                        "failed",
                        false,
                        "no verified overwrite authority exists",
                        "",
                        "",
                        false,
                        false,
                        "",
                    );
                    return Ok(json!({"accepted": true, "picker": false}));
                }
            }
        };
        let destination = files::normalize(Path::new(&destination))
            .to_string_lossy()
            .into_owned();
        let written = (|| -> std::io::Result<String> {
            if session.bytes.len() != session.length
                || files::sha256(&session.bytes) != session.digest
            {
                return Err(std::io::Error::other(
                    "transferred bytes do not match the intended document",
                ));
            }
            // A read-only file is never written over, in place or by Save As.
            if !session.exclusive && std::fs::metadata(&destination).is_ok_and(|m| m.permissions().readonly()) {
                return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "the file is read-only"));
            }
            // New files need a writable folder. An existing writable file can be
            // saved in place with a durable recovery copy kept by the host.
            if let Some(folder) = Path::new(&destination).parent() {
                let existing = folder.ancestors().find(|f| f.is_dir()).unwrap_or(folder);
                if std::fs::metadata(existing).is_ok_and(|m| m.permissions().readonly()) &&
                    (session.exclusive || !Path::new(&destination).is_file()) {
                    return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied, READ_ONLY_FOLDER));
                }
                std::fs::create_dir_all(folder)?;
            }
            let actual = files::generation_of(&destination);
            if !picked {
                let expected = self
                    .current
                    .as_ref()
                    .map(|c| c.generation.clone())
                    .unwrap_or_default();
                let named = session.file_generation.as_str().filter(|g| !g.is_empty());
                if actual != expected || named.map(|g| g != actual).unwrap_or(false) {
                    // The page says why: changed (it compares or reloads) or moved or deleted (Save As keeps it).
                    if actual.is_empty() {
                        self.event("file.changed", json!({"path": destination, "documentAuthority": session.authority, "missing": true}));
                    } else {
                        self.event("file.changed", json!({"path": destination, "documentAuthority": session.authority, "fileGeneration": actual}));
                    }
                    return Err(std::io::Error::other(if actual.is_empty() {
                        "could not verify the source; retry when it is available"
                    } else {
                        "the file changed outside Rapier"
                    }));
                }
            }
            if unchosen {
                // A new file a person saved, readable as any file they save is (0644 before their umask), not a private copy.
                files::write_new_copy(&destination, &session.bytes, &session.digest).and_then(|generation| {
                    let mask = unsafe { libc::umask(0o022) };
                    unsafe { libc::umask(mask) };
                    std::fs::set_permissions(&destination, std::os::unix::fs::PermissionsExt::from_mode(0o644 & !(mask as u32)))?;
                    Ok(generation)
                })
            } else if session.exclusive {
                if session.purpose != "export" {
                    return Err(std::io::Error::other(
                        "exclusive copy cannot replace a document binding",
                    ));
                }
                files::write_new_copy(&destination, &session.bytes, &session.digest)
            } else {
                files::write_verified(&destination, &session.bytes, &session.digest, &crate::instance_dir().join("pending-saves"))
            }
        })();
        let generation = match written {
            Ok(generation) => generation,
            Err(error) => {
                let code = if session.exclusive {
                    if error.kind() == std::io::ErrorKind::AlreadyExists {
                        "destination_exists"
                    } else {
                        "copy_not_created"
                    }
                } else if error.kind() == std::io::ErrorKind::PermissionDenied {
                    if error.to_string() == READ_ONLY_FOLDER { "read_only_folder" } else { "read_only" }
                } else if matches!(error.raw_os_error(), Some(libc::ENOSPC) | Some(libc::EDQUOT)) {
                    // No room (or over quota): the page says so and offers Save As somewhere else, not "save failed".
                    "disk_full"
                } else if !picked && error.to_string() == "the file changed outside Rapier" {
                    // The page's own words for it (a file changed or deleted since it was opened), not "save failed".
                    "external_file_changed"
                } else if !picked && error.to_string().starts_with("could not verify the source") {
                    // A deleted file: the page's own "File moved or deleted" notice comes with file.changed (missing).
                    "external_file_changed"
                } else {
                    ""
                };
                self.save_result(
                    &session,
                    "failed",
                    false,
                    &error.to_string(),
                    &destination,
                    "",
                    false,
                    picked,
                    code,
                );
                return Ok(json!({"accepted": true, "picker": picked}));
            }
        };
        // Rapier's own write is never a change made elsewhere: a copy written over the open file moves its binding too.
        if let Some(current) = self.current.as_mut().filter(|c| c.path == destination) {
            current.generation = generation.clone();
            self.keep_binding();
        }
        let mut published = false;
        if session.purpose != "export" {
            let authority = if session.authority.is_empty() {
                files::authority_for(&destination)
            } else {
                session.authority.clone()
            };
            published = !session.authority.is_empty() && session.authority == authority;
            self.current = Some(Bound {
                path: destination.clone(),
                authority,
                generation: generation.clone(),
            });
            self.origin = Path::new(&destination).parent().map(Path::to_path_buf);
            self.untitled = 0;
            self.keep_binding();
            self.label_window();
        }
        self.save_result(
            &session,
            "confirmed",
            true,
            "",
            &destination,
            &generation,
            published,
            picked,
            "",
        );
        self.notify_linked_windows(&destination, &generation);
        Ok(json!({"accepted": true, "picker": picked}))
    }

    #[allow(clippy::too_many_arguments)]
    fn save_result(
        &mut self,
        session: &Transfer,
        status: &str,
        ok: bool,
        error: &str,
        path: &str,
        generation: &str,
        published: bool,
        selected: bool,
        code: &str,
    ) {
        let mut detail = json!({"requestId": session.request_id, "purpose": session.purpose, "documentAuthority": session.authority,
            "documentGeneration": session.document_generation, "documentRevision": session.document_revision, "payloadLength": session.length,
            "payloadDigest": session.digest, "status": status, "ok": ok, "verified": ok, "bindingPublished": published,
            "destinationName": if path.is_empty() { String::new() } else { shown_name(path) }, "destinationSelected": selected});
        if !code.is_empty() {
            detail["errorCode"] = json!(code);
        }
        // Every written file's toast names its folder; one written without a file chooser says so too.
        let unchosen = self.saved_where.take().is_some();
        if status == "confirmed" && !path.is_empty() {
            if let Some(folder) = Path::new(path).parent() {
                detail["savedWhere"] = json!(files::shown(folder));
            }
            if unchosen {
                detail["noChooser"] = json!(true);
            }
        }
        if !error.is_empty() {
            detail["error"] = json!(error);
        }
        if !path.is_empty() {
            detail["path"] = json!(path);
        }
        if !generation.is_empty() {
            detail["fileGeneration"] = json!(generation);
        }
        let message = json!({"type": "event", "event": "document.saveResult", "detail": detail});
        // Replayed until the page acknowledges it.
        let key = (session.request_id.clone(), session.digest.clone());
        self.receipts.retain(|(k, _)| *k != key);
        self.receipts.push((key, message.clone()));
        self.post("host", message);
    }

    fn open_external(&self, url: &str) -> bool {
        let lower = url.to_lowercase();
        if !(lower.starts_with("https://")
            || lower.starts_with("http://")
            || lower.starts_with("mailto:"))
        {
            return false;
        }
        let mut command = Command::new("xdg-open");
        command
            .arg(url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .process_group(0);
        command.spawn().is_ok()
    }
}

fn read_browser(mut reader: File, events: Sender<Event>) {
    let mut buffer: Vec<u8> = Vec::new();
    let mut chunk = vec![0u8; 1 << 16];
    loop {
        let read = reader.read(&mut chunk).unwrap_or(0);
        if read == 0 {
            let _ = events.send(Event::Exit);
            return;
        }
        buffer.extend_from_slice(&chunk[..read]);
        while let Some(end) = buffer.iter().position(|&b| b == 0) {
            let line: Vec<u8> = buffer.drain(..=end).collect();
            if let Ok(message) = serde_json::from_slice::<Value>(&line[..line.len() - 1]) {
                if events.send(Event::Cdp(message)).is_err() {
                    return;
                }
            }
        }
    }
}

/// A new launch must not put its first file over another document's recovery.
fn starting_slot(path: Option<&str>, kept: &[(u32, String)]) -> u32 {
    let Some(path) = path else { return 1; };
    if let Some((slot, _)) = kept.iter().find(|(_, held)| !held.is_empty() &&
        files::normalize(Path::new(path)) == files::normalize(Path::new(held))) {
        return *slot;
    }
    (1..).find(|slot| kept.iter().all(|(held, _)| held != slot)).unwrap_or(1)
}

/// A reopened file takes its draft's number; other windows skip every kept draft.
/// Slot 1 remains reserved for the first window unless its own file asks for it.
fn next_slot(path: Option<&str>, open: &[u32], kept: impl Fn(u32) -> Option<String>) -> u32 {
    let same = |held: &str| path.is_some_and(|p| files::normalize(Path::new(p)) == files::normalize(Path::new(held)));
    let past = open.iter().copied().max().unwrap_or(1) + (1 << 8);
    if let Some(n) = (1..past).find(|n| !open.contains(n) && kept(*n).is_some_and(|held| !held.is_empty() && same(&held))) {
        return n;
    }
    (2..).find(|n| !open.contains(n) && kept(*n).is_none()).unwrap_or(2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_launch_keeps_another_documents_draft_slot() {
        let kept = vec![(1, "/work/a.md".to_string()), (3, "/work/c.md".to_string())];
        assert_eq!(starting_slot(None, &kept), 1);
        assert_eq!(starting_slot(Some("/work/a.md"), &kept), 1);
        assert_eq!(starting_slot(Some("/work/c.md"), &kept), 3);
        assert_eq!(starting_slot(Some("/work/b.md"), &kept), 2);
        assert_eq!(starting_slot(Some(crate::NEW_DOCUMENT), &kept), 2);
        assert_eq!(starting_slot(Some("/work/b.md"), &[]), 1);
    }

    #[test]
    fn a_reopened_file_takes_its_kept_draft_back() {
        let kept = |n: u32| match n {
            1 => Some("/work/a.md".to_string()),
            3 => Some("/work/c.md".to_string()),
            _ => None,
        };
        // a.md's window (1) closed with unsaved work and b.md's (2) is open: a.md goes back to 1.
        assert_eq!(next_slot(Some("/work/a.md"), &[2], kept), 1);
        // A file with no draft skips the slot holding c.md's (3), and slot 1 is never handed out again.
        assert_eq!(next_slot(Some("/work/d.md"), &[2], kept), 4);
        assert_eq!(next_slot(None, &[], |_| None), 2);
        // A draft whose window is open is not taken.
        assert_eq!(next_slot(Some("/work/a.md"), &[1, 2], kept), 4);
    }

    #[test]
    fn copy_names() {
        let folder = std::env::temp_dir().join(format!("rapier-copy-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        assert_eq!(free_copy_name(&folder, "five (copy).md"), "five (copy).md");
        std::fs::write(folder.join("five (copy).md"), "").unwrap();
        assert_eq!(free_copy_name(&folder, "five (copy).md"), "five (copy 2).md");
        std::fs::write(folder.join("five (copy 2).md"), "").unwrap();
        assert_eq!(free_copy_name(&folder, "five (copy).md"), "five (copy 3).md");
        std::fs::write(folder.join("a (copy).rapier.html"), "").unwrap();
        assert_eq!(free_copy_name(&folder, "a (copy).rapier.html"), "a (copy 2).rapier.html");
        assert_eq!(free_copy_name(&folder, "plain.md"), "plain.md");
        std::fs::remove_dir_all(&folder).unwrap();
    }

    // Every state a window can be in, by every route a document arrives: only the pristine window takes it.
    #[test]
    fn where_the_next_document_goes() {
        let pristine = Holding::default();
        let states = [
            ("pristine", pristine, Place::ThisWindow),
            ("saved file", Holding { file: true, ..pristine }, Place::OwnWindow),
            ("imported web page", Holding { imported: true, ..pristine }, Place::OwnWindow),
            ("unsaved work", Holding { unsaved: true, ..pristine }, Place::OwnWindow),
            ("text from stdin", Holding { given_text: true, ..pristine }, Place::OwnWindow),
            ("still opening", Holding { opening: true, ..pristine }, Place::OwnWindow),
            ("others queued", Holding { others_waiting: true, ..pristine }, Place::OwnWindow),
        ];
        for (name, state, place) in states {
            for route in [Route::File, Route::NewDocument] {
                assert_eq!(goes_to(state, route), place, "{name} by {route:?}");
            }
        }
    }
}
