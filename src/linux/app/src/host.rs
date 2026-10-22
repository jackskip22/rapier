// SPDX-License-Identifier: AGPL-3.0-only
// The page's host: the browser over the DevTools pipe, the page's messages, opening and saving. A line-for-line
// carriage of linux/rapier's Host, so the page meets the same contract on every Linux install.
use crate::{files, folder::Broker, portal, theme, Event, ORIGIN, PAGE};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Map, Value};
use std::collections::VecDeque;
use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{FromRawFd, RawFd};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{Receiver, Sender};

const CHUNK: usize = 128 * 1024;
const MAX_MESSAGE: usize = 512 * 1024;
const BINARY: [&str; 4] = [".docx", ".pdf", ".textpack", ".zip"];
const CAPABILITIES: [&str; 12] = [
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
];

// Runs in every frame before the page. Only the top rapier page keeps the bridge; the host also refuses any binding
// call from another execution context.
const ADAPTER: &str = r#"(() => {
  const send = globalThis.__rapierLinux;
  try { delete globalThis.__rapierLinux; } catch (_) {}
  if (location.origin !== 'https://rapier.local' || location.pathname !== '/rapier.html' || window.top !== window || typeof send !== 'function') return;
  Object.defineProperty(window, '__RAPIER_NATIVE_PLATFORM_ID', { value: 'linux', configurable: false });
  const make = channel => ({ onmessage: null, postMessage(value) { send(JSON.stringify({ channel, payload: String(value == null ? '' : value) })); } });
  const host = make('host'), intake = make('intake');
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
  addEventListener('DOMContentLoaded', () => { titled.disconnect(); if (searchTitle !== null && document.title === searchTitle) document.title = 'Rapier'; }, { once: true });
  // The first window never stays taller or wider than the screen's work area: the host resizes it (fit_window).
  // The window manager's frame is outside outerWidth/outerHeight (xfwm4: 29 px on top, 5 below), so the
  // window is fitted to the work area less a frame allowance and placed at its corner.
  const fit = () => {
    const width = Math.min(outerWidth, screen.availWidth - 16), height = Math.min(outerHeight, screen.availHeight - 64);
    if (screen.availWidth > 0 && screen.availHeight > 0 && (width < outerWidth || height < outerHeight))
      send(JSON.stringify({ channel: 'window', payload: JSON.stringify({ width, height, left: screen.availLeft || 0, top: screen.availTop || 0 }) }));
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

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn str_of(value: &Value, key: &str) -> String {
    match value.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

struct Intake {
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
}

pub struct Host {
    app: PathBuf,
    out: File,
    next_id: u64,
    session: Option<String>,
    target: String,
    context: Option<i64>,
    page_ready: bool,
    intake_ready: bool,
    pending_paths: VecDeque<String>,
    intake: Option<Intake>,
    candidate: Option<Candidate>,
    intake_id: u64,
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
    // The other windows, and paths waiting for a window of their own (a second document never replaces the first).
    others: Vec<Win>,
    waiting_paths: VecDeque<String>,
    new_windows: VecDeque<String>,
    // How the browser was started, to ask it for another app window (spawn_window).
    browser_path: PathBuf,
    browser_args: Vec<String>,
    deferred: VecDeque<Event>,
    events: Sender<Event>,
    browser: Child,
}

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
        // Snap Chromium may not write hidden folders in home (~/.local): its profile lives in the snap's own area.
        let profile = if browser.starts_with("/snap/") {
            crate::home().join("snap/chromium/common/rapier-browser")
        } else {
            crate::data_dir().join("rapier/browser")
        };
        std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
        // The first document opens in the first window; each other one gets a window of its own.
        let mut rest: VecDeque<String> = paths.into();
        let first = rest.pop_front();
        let (to_browser, out) = pipe().map_err(|e| e.to_string())?;
        let (inp, from_browser) = pipe().map_err(|e| e.to_string())?;
        // The window is named after its first URL (chrome-rapier.local__rapier.html-Default), so it opens the page at
        // once; start() loads it again once the bridge is attached. rapier.local never reaches DNS or mDNS.
        let mut args = vec![
            "--remote-debugging-pipe".to_string(),
            format!("--user-data-dir={}", profile.display()),
            format!("--app={PAGE}"),
            "--host-resolver-rules=MAP rapier.local ~NOTFOUND".into(),
            // The window's class (X11 WM_CLASS, Wayland app_id) is rapier's, matching the launcher's StartupWMClass.
            "--class=rapier".into(),
            "--no-first-run".into(),
            "--no-default-browser-check".into(),
            "--disable-sync".into(),
            "--disable-component-update".into(),
        ];
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
            pending_paths: first.into_iter().collect(),
            intake: None,
            candidate: None,
            intake_id: 0,
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
            others: Vec::new(),
            waiting_paths: rest,
            new_windows: VecDeque::new(),
            browser_path: browser.to_path_buf(),
            browser_args: args.iter().filter(|a| a.as_str() != "--remote-debugging-pipe").cloned().collect(),
            deferred: VecDeque::new(),
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

    /// A window that holds or is receiving a document: another document gets its own window.
    fn busy(&self) -> bool {
        self.current.is_some() || self.text_held || self.candidate.is_some() || self.intake.is_some() || !self.pending_paths.is_empty()
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
        let mut parked = Win::default();
        self.exchange(&mut parked);
        self.others.push(parked);
        self.target = target;
        let id = self.cdp("Target.attachToTarget", json!({"targetId": self.target, "flatten": true}), false);
        self.session = Some(str_of(&self.wait(receiver, id)?, "sessionId"));
        self.prepare_window(receiver)?;
        self.pending_paths.extend(self.waiting_paths.pop_front());
        self.cdp("Page.navigate", json!({"url": PAGE}), true);
        Ok(())
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

    /// Only during start: other events wait their turn in run().
    fn wait(&mut self, receiver: &Receiver<Event>, ident: u64) -> Result<Value, String> {
        let mut held = VecDeque::new();
        let result = loop {
            match receiver.recv() {
                Err(_) | Ok(Event::Exit) => std::process::exit(0),
                Ok(Event::Cdp(message)) if message.get("id") == Some(&json!(ident)) => {
                    if let Some(error) = message.get("error") {
                        break Err(str_of(error, "message"));
                    }
                    break Ok(message.get("result").cloned().unwrap_or(json!({})));
                }
                Ok(other) => held.push_back(other),
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
            (
                "Page.addScriptToEvaluateOnNewDocument",
                json!({"source": ADAPTER}),
            ),
        ] {
            let id = self.cdp(method, params, true);
            self.wait(receiver, id)?;
        }
        self.theme_to_window();
        let id = self.cdp("Browser.getWindowForTarget", json!({"targetId": self.target.clone()}), false);
        self.window_id = self.wait(receiver, id).ok().and_then(|w| w.get("windowId").and_then(Value::as_i64));
        Ok(())
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
        self.prepare_window(receiver)?;
        let sender = self.events.clone();
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
        self.cdp("Page.navigate", json!({"url": PAGE}), true);
        Ok(())
    }

    pub fn run(&mut self, receiver: Receiver<Event>) {
        if let Err(error) = self.start(&receiver) {
            eprintln!("rapier: the browser did not start the page: {error}");
            let _ = self.browser.kill();
            return;
        }
        // Each further document given at launch opens in a window of its own.
        for _ in 0..self.waiting_paths.len() {
            self.spawn_window();
        }
        loop {
            let event = match self.deferred.pop_front() {
                Some(event) => event,
                None => match receiver.recv() {
                    Ok(event) => event,
                    Err(_) => return,
                },
            };
            match event {
                Event::Exit => return,
                Event::Cdp(message) => self.on_cdp(message),
                Event::Theme => self.apply_theme(),
                Event::Open(path) if path == crate::THEME_CHANGED => self.apply_theme(),
                Event::Open(path) => {
                    // A window holding a document keeps it: the new one waits for a window of its own.
                    if self.busy() || !self.waiting_paths.is_empty() {
                        self.waiting_paths.push_back(path);
                        self.spawn_window();
                    } else {
                        self.pending_paths.push_back(path);
                        self.pump();
                    }
                }
            }
            while let Some(target) = self.new_windows.pop_front() {
                if let Err(error) = self.adopt(&receiver, target) {
                    eprintln!("rapier: a new window did not start: {error}");
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
        if let Some(folder) = self.current.as_ref().and_then(|c| Path::new(&c.path).parent().map(Path::to_path_buf)) {
            return folder;
        }
        std::fs::read_to_string(crate::data_dir().join("rapier/last-folder"))
            .ok()
            .map(|text| PathBuf::from(text.trim_end_matches('\n')))
            .filter(|path| path.is_absolute() && path.is_dir())
            .unwrap_or_else(|| Some(files::documents_dir()).filter(|d| d.is_dir()).unwrap_or_else(crate::home))
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

    /// The window never stays larger than the screen's work area (945 x 1180 on a 1080p screen hid
    /// the menu's lower rows). The page reports the sizes once it has loaded and the window is final (ADAPTER); a tiling
    /// compositor sizes the window itself and ignores this.
    fn fit_window(&mut self, sizes: &Value) {
        let (Some(window_id), Some(width), Some(height)) =
            (self.window_id, sizes["width"].as_i64(), sizes["height"].as_i64())
        else {
            return;
        };
        if width < 320 || height < 240 {
            return;
        }
        self.cdp(
            "Browser.setWindowBounds",
            json!({"windowId": window_id, "bounds": {"windowState": "normal", "left": sizes["left"].as_i64().unwrap_or(0),
                "top": sizes["top"].as_i64().unwrap_or(0), "width": width, "height": height}}),
            false,
        );
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
        let Some((palette, css)) = self.theme.clone() else {
            return;
        };
        if let Some(p) = &palette {
            // rapier's System theme follows the media query, so it follows Omarchy's light or dark.
            self.cdp(
                "Emulation.setEmulatedMedia",
                json!({"features": [{"name": "prefers-color-scheme", "value": p.mode}]}),
                true,
            );
        }
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
                let mut state = json!({"platformId": "linux", "capabilities": CAPABILITIES.iter().map(|c| (c.to_string(), json!(true))).collect::<Map<_, _>>(),
                    "recents": [], "pendingIntake": self.intake.is_some() || self.candidate.is_some() || !self.pending_paths.is_empty(),
                    "currentFileBound": self.current.is_some(), "installation": {"state": "standalone", "installed": true}});
                if let Some(current) = &self.current {
                    state["currentFileAuthority"] = json!(current.authority);
                    state["currentFileGeneration"] = json!(current.generation);
                }
                self.ok(ident, state);
                self.prime();
            }
            "page.ready" => {
                self.page_ready = true;
                self.ok(ident, json!({}));
                for message in self.receipts.clone().into_iter().map(|(_, m)| m) {
                    self.post("host", message);
                }
                self.pump();
            }
            "folder.choose" => {
                let path = match portal::pick(false, "", "Open", true, &self.start_folder()) {
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
                match self.open_folder(&path).and_then(|mut folder| {
                    folder
                        .call("hello", &json!({}))
                        .map(|hello| (folder, hello))
                }) {
                    Ok((folder, hello)) => {
                        self.close_folder();
                        let mut result = if hello.is_object() { hello } else { json!({}) };
                        result["token"] = json!(folder.token);
                        self.folder = Some(folder);
                        self.ok(ident, result);
                    }
                    Err(reason) => self.ok(
                        ident,
                        json!({"status": "unavailable", "provider": "linux", "reason": reason}),
                    ),
                }
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
                let path = match portal::pick(
                    false,
                    "",
                    if compare { "Compare with" } else { "Open" },
                    false,
                    &self.start_folder(),
                ) {
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
                self.begin_intake(&path, if compare { "compare" } else { "open" })
                    .map_err(|e| e.to_string())?;
                self.ok(ident, json!({"started": true}));
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
                    || authority != candidate.bound.authority
                    || str_of(args, "fileGeneration") != candidate.bound.generation
                {
                    return Err("opened document does not match native intake authority".into());
                }
                let bound = self.candidate.take().unwrap().bound;
                if files::generation_of(&bound.path) != bound.generation {
                    self.pump();
                    return Err(
                        "opened file changed or became unavailable before acceptance".into(),
                    );
                }
                self.current = Some(bound);
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
                }
                self.ok(ident, json!({}));
            }
            "intake.clear" => {
                self.intake = None;
                self.candidate = None;
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
            "document.dirty" | "document.title" | "window.theme" => self.ok(ident, json!({})),
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
                        json!({"name": basename(&path), "error": message, "message": message}),
                    );
                }
            }
        }
    }

    /// A new document with no file behind it (`--new`, or text read from stdin with `rapier -`): Save asks where.
    fn begin_text(&mut self, data: Vec<u8>) -> std::io::Result<()> {
        if self.intake.is_some() || self.candidate.is_some() {
            return Err(std::io::Error::other("another file open is already in progress"));
        }
        self.text_held = true;
        self.intake_id += 1;
        self.delivery += 1;
        let frame = crate::random_hex(16);
        self.post("intake", json!({"type": "begin", "id": self.intake_id, "deliveryGeneration": self.delivery, "generation": frame,
            "name": "untitled.md", "path": null, "documentAuthority": "", "fileGeneration": null, "purpose": "external",
            "transient": true, "binary": false}));
        self.intake = Some(Intake { id: self.intake_id, delivery: self.delivery, frame, bytes: data, offset: 0, sequence: 0,
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
            return self.begin_text(Vec::new());
        }
        if let Some(text) = path.strip_prefix(crate::STDIN_DOCUMENT) {
            // The text main() set aside from stdin, in a private file that is read once and removed.
            let data = std::fs::read(text)?;
            let _ = std::fs::remove_file(text);
            return self.begin_text(data);
        }
        let path = files::normalize(&std::env::current_dir().unwrap_or_default().join(path))
            .to_string_lossy()
            .into_owned();
        let (data, generation) = files::read_snapshot(&path)?;
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
        self.post("intake", json!({"type": "begin", "id": self.intake_id, "deliveryGeneration": self.delivery, "generation": frame,
            "name": basename(&path), "path": path, "documentAuthority": authority, "fileGeneration": generation, "purpose": purpose, "binary": binary}));
        self.intake = Some(Intake {
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
            let end = json!({"type": "end", "id": state.id, "deliveryGeneration": state.delivery, "fileGeneration": state.generation});
            self.intake = None;
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
        let picked = session.purpose != "saveInPlace";
        // No file chooser on this desktop (no xdg-desktop-portal): a person can still save. The copy goes beside the open
        // file, or into Documents, under a name nothing has, and the page says where.
        let mut unchosen = false;
        let destination = if picked {
            let chosen = match portal::pick(true, &session.name, "Save as", false, &self.start_folder()) {
                Ok(chosen) => chosen,
                Err(reason) => {
                    let folder = self
                        .current
                        .as_ref()
                        .and_then(|c| Path::new(&c.path).parent().map(Path::to_path_buf))
                        .unwrap_or_else(files::documents_dir);
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
            let actual = files::generation_of(&destination);
            if !picked {
                let expected = self
                    .current
                    .as_ref()
                    .map(|c| c.generation.clone())
                    .unwrap_or_default();
                let named = session.file_generation.as_str().filter(|g| !g.is_empty());
                if actual != expected || named.map(|g| g != actual).unwrap_or(false) {
                    if !actual.is_empty() {
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
                files::write_verified(&destination, &session.bytes, &session.digest)
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
            "destinationName": if path.is_empty() { String::new() } else { basename(path) }, "destinationSelected": selected});
        if !code.is_empty() {
            detail["errorCode"] = json!(code);
        }
        if let Some(folder) = self.saved_where.take() {
            if status == "confirmed" {
                detail["savedWhere"] = json!(folder);
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
