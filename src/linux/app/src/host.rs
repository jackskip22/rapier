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
        let profile = crate::data_dir().join("rapier/browser");
        std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
        let (to_browser, out) = pipe().map_err(|e| e.to_string())?;
        let (inp, from_browser) = pipe().map_err(|e| e.to_string())?;
        // The window is named after its first URL (chrome-rapier.local__rapier.html-Default), so it opens the page at
        // once; start() loads it again once the bridge is attached. rapier.local never reaches DNS or mDNS.
        let mut args = vec![
            "--remote-debugging-pipe".to_string(),
            format!("--user-data-dir={}", profile.display()),
            format!("--app={PAGE}"),
            "--host-resolver-rules=MAP rapier.local ~NOTFOUND".into(),
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
            pending_paths: paths.into(),
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
            deferred: VecDeque::new(),
            events,
            browser: child,
        })
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
        self.apply_theme();
        let sender = self.events.clone();
        std::thread::spawn(move || {
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
                Event::Open(path) => {
                    self.pending_paths.push_back(path);
                    self.pump();
                }
            }
        }
    }

    fn on_cdp(&mut self, message: Value) {
        let method = str_of(&message, "method");
        let params = message.get("params").cloned().unwrap_or(json!({}));
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
            "Target.targetCreated" => {
                let info = &params["targetInfo"];
                // A new window from the page opens in the person's browser, never inside the app.
                if info["type"] == "page" && info.get("openerId") == Some(&json!(self.target)) {
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

    // -- Omarchy ------------------------------------------------------------------------------------------------------
    /// Give the page the person's Omarchy theme and font, at start and after each switch.
    fn apply_theme(&mut self) {
        let mut palette = theme::palette();
        if palette.is_none() {
            if let Some((last, _)) = &self.theme {
                palette = last.clone(); // a switch replaces the theme folder: keep the last theme meanwhile
            }
        }
        let css = theme::css(palette.as_ref(), &theme::font());
        let next = (palette.clone(), css.clone());
        if self.theme.as_ref() == Some(&next) || (self.theme.is_none() && css.is_empty()) {
            return;
        }
        self.theme = Some(next);
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
                let path = match portal::pick(false, "", "Open", true) {
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
                let path = portal::pick(
                    false,
                    "",
                    if compare { "Compare with" } else { "Open" },
                    false,
                )?;
                if path.is_empty() {
                    self.ok(ident, json!({"cancelled": true}));
                    return Ok(());
                }
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

    fn begin_intake(&mut self, path: &str, purpose: &str) -> std::io::Result<()> {
        if self.intake.is_some() || self.candidate.is_some() {
            return Err(std::io::Error::other(
                "another file open is already in progress",
            ));
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
        let destination = if picked {
            let chosen = match portal::pick(true, &session.name, "Save as", false) {
                Ok(chosen) => chosen,
                Err(reason) => {
                    self.save_result(&session, "failed", false, &reason, "", "", false, false, "no_file_chooser");
                    return Ok(json!({"accepted": true, "picker": true}));
                }
            };
            if chosen.is_empty() {
                self.save_result(&session, "cancelled", false, "", "", "", false, false, "");
                return Ok(json!({"accepted": true, "picker": true}));
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
            if session.exclusive {
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
