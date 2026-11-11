// SPDX-License-Identifier: AGPL-3.0-only
// Test-only xdg-desktop-portal FileChooser and OpenURI services. Run under an isolated dbus-run-session.
// PORTAL_FIXTURE/next controls document selection; next-open controls attachment responses. No desktop UI is claimed.
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use zbus::message::Header;
use zbus::zvariant::{OwnedObjectPath, OwnedValue, Value};

struct Chooser(PathBuf);
impl Chooser {
    async fn answer(
        &self,
        kind: &str,
        parent: &str,
        options: HashMap<String, OwnedValue>,
        header: Header<'_>,
        connection: &zbus::Connection,
    ) -> zbus::fdo::Result<OwnedObjectPath> {
        let token = options
            .get("handle_token")
            .and_then(|v| <&str>::try_from(v).ok())
            .ok_or_else(|| zbus::fdo::Error::InvalidArgs("missing handle token".into()))?;
        let sender = header.sender().unwrap().as_str().to_string();
        let handle: OwnedObjectPath = format!(
            "/org/freedesktop/portal/desktop/request/{}/{}",
            sender.trim_start_matches(':').replace('.', "_"),
            token
        )
        .try_into()
        .unwrap();
        let chosen = std::fs::read_to_string(self.0.join("next"))
            .map_err(|e| zbus::fdo::Error::Failed(e.to_string()))?;
        let chosen = chosen.trim().to_string();
        if !["CANCEL", "STALL_CALL", "STALL_RESPONSE"].contains(&chosen.as_str()) && !chosen.starts_with('/') {
            return Err(zbus::fdo::Error::InvalidArgs("fixture path must be absolute".into()));
        }
        let mut log = std::fs::OpenOptions::new()
            .create(true).append(true).open(self.0.join("requests.jsonl")).unwrap();
        writeln!(log, "{}", serde_json::json!({
            "method": kind, "chosen": chosen, "parent": parent,
            "directory": options.get("directory").and_then(|v| bool::try_from(v).ok()).unwrap_or(false),
            "currentName": options.get("current_name").and_then(|v| <&str>::try_from(v).ok()),
            "currentFolder": options.get("current_folder").and_then(|v| v.try_clone().ok())
                .and_then(|v| Vec::<u8>::try_from(v).ok())
                .map(|bytes| String::from_utf8_lossy(bytes.strip_suffix(&[0]).unwrap_or(&bytes)).into_owned())
        })).unwrap();
        if chosen == "STALL_CALL" { std::future::pending::<()>().await; }
        if chosen == "STALL_RESPONSE" { return Ok(handle); }
        let signal_handle = handle.clone();
        let connection = zbus::blocking::Connection::from(connection.clone());
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(25));
            let mut result: HashMap<&str, Value> = HashMap::new();
            let canceled = chosen == "CANCEL";
            if !canceled {
                let uri = format!("file://{}", chosen.replace('%', "%25").replace(' ', "%20")
                    .replace('#', "%23").replace('?', "%3F"));
                result.insert("uris", Value::from(vec![uri]));
            }
            connection.emit_signal(
                Some(sender.as_str()), signal_handle.as_str(),
                "org.freedesktop.portal.Request", "Response",
                &(if canceled { 1u32 } else { 0u32 }, result),
            ).unwrap();
        });
        Ok(handle)
    }
}

#[zbus::interface(name = "org.freedesktop.portal.FileChooser")]
impl Chooser {
    async fn open_file(
        &self, parent: &str, _title: &str, options: HashMap<String, OwnedValue>,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &zbus::Connection,
    ) -> zbus::fdo::Result<OwnedObjectPath> {
        self.answer("OpenFile", parent, options, header, connection).await
    }
    async fn save_file(
        &self, parent: &str, _title: &str, options: HashMap<String, OwnedValue>,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &zbus::Connection,
    ) -> zbus::fdo::Result<OwnedObjectPath> {
        self.answer("SaveFile", parent, options, header, connection).await
    }
}


// Attachment requests are separate from FileChooser so old document replays keep their exact fixture controls.
struct OpenUri(PathBuf);
#[derive(Default)]
struct RequestState { closed: AtomicBool, response_gate: Mutex<()> }
struct Request { root: PathBuf, path: String, state: Arc<RequestState> }

fn log(root: &std::path::Path, value: serde_json::Value) -> zbus::fdo::Result<()> {
    let mut bytes = serde_json::to_vec(&value).unwrap(); bytes.push(b'\n');
    std::fs::OpenOptions::new().create(true).append(true).open(root.join("requests.jsonl"))
        .and_then(|mut file| file.write_all(&bytes)).map_err(|e| zbus::fdo::Error::Failed(e.to_string()))
}

#[zbus::interface(name = "org.freedesktop.portal.Request")]
impl Request {
    fn close(&self, #[zbus(connection)] connection: &zbus::Connection) -> zbus::fdo::Result<()> {
        // Serialize Close with emission: a flag check alone could race a late Response.
        let gate = self.state.response_gate.lock().map_err(|_| zbus::fdo::Error::Failed("request gate poisoned".into()))?;
        self.state.closed.store(true, Ordering::Release);
        log(&self.root, serde_json::json!({"method": "Request.Close", "handle": self.path, "responseEmitted": false}))?;
        drop(gate);
        let (root, path) = (self.root.clone(), self.path.clone());
        let connection = zbus::blocking::Connection::from(connection.clone());
        std::thread::spawn(move || {
            let removed = connection.object_server().remove::<Request, _>(path.as_str()).unwrap_or(false);
            let _ = log(&root, serde_json::json!({"method": "Request.Closed", "handle": path, "removed": removed}));
        });
        Ok(())
    }
}

fn respond(connection: &zbus::blocking::Connection, root: &std::path::Path, handle: &str,
    sender: &str, state: &RequestState, code: u32) {
    let Ok(gate) = state.response_gate.lock() else { return };
    if state.closed.load(Ordering::Acquire) { return; }
    let result: HashMap<&str, Value> = HashMap::new();
    let emitted = connection.emit_signal(Some(sender), handle, "org.freedesktop.portal.Request", "Response", &(code, result));
    let _ = log(root, serde_json::json!({"method": "Request.Response", "handle": handle,
        "code": code, "responseEmitted": emitted.is_ok()}));
    drop(gate);
    let _ = connection.object_server().remove::<Request, _>(handle);
}

// A deterministic test gate that leaves the async D-Bus dispatcher runnable.
async fn wait_until_removed(path: PathBuf) {
    let state = Arc::new(Mutex::new((false, None::<std::task::Waker>)));
    let complete = state.clone();
    std::thread::spawn(move || {
        while path.exists() { std::thread::sleep(std::time::Duration::from_millis(10)); }
        let mut state = complete.lock().unwrap();
        state.0 = true;
        if let Some(waker) = state.1.take() { waker.wake(); }
    });
    std::future::poll_fn(move |context| {
        let mut state = state.lock().unwrap();
        if state.0 { std::task::Poll::Ready(()) }
        else { state.1 = Some(context.waker().clone()); std::task::Poll::Pending }
    }).await;
}

#[zbus::interface(name = "org.freedesktop.portal.OpenURI")]
impl OpenUri {
    #[zbus(property, name = "version")]
    fn version(&self) -> u32 {
        std::fs::read_to_string(self.0.join("open-version")).ok().and_then(|v| v.trim().parse().ok()).unwrap_or(3)
    }

    async fn open_file(&self, parent: &str, fd: zbus::zvariant::OwnedFd, options: HashMap<String, OwnedValue>,
        #[zbus(header)] header: Header<'_>, #[zbus(connection)] connection: &zbus::Connection,
    ) -> zbus::fdo::Result<OwnedObjectPath> {
        use sha2::{Digest, Sha256};
        use std::io::Read;
        use std::os::fd::AsRawFd;
        let token = options.get("handle_token").and_then(|v| <&str>::try_from(v).ok())
            .ok_or_else(|| zbus::fdo::Error::InvalidArgs("missing handle token".into()))?;
        let sender = header.sender().unwrap().as_str().to_owned();
        let handle = format!("/org/freedesktop/portal/desktop/request/{}/{}", sender.trim_start_matches(':').replace('.', "_"), token);
        let mode = std::fs::read_to_string(self.0.join("next-open")).unwrap_or_else(|_| "OPEN".into()).trim().to_owned();
        if !["OPEN", "CANCEL", "REFUSE", "DENY", "STALL", "DISAPPEAR", "WRONG_HANDLE", "WRONG_SENDER", "STALL_CALL", "SUCCESS_BEFORE_RETURN", "SUCCESS_WITHOUT_RETURN"].contains(&mode.as_str()) {
            return Err(zbus::fdo::Error::InvalidArgs("unknown attachment fixture mode".into()));
        }
        let fd: std::os::fd::OwnedFd = fd.into(); let mut file = std::fs::File::from(fd);
        let flags = rustix::fs::fcntl_getfl(&file).map_err(|e| zbus::fdo::Error::Failed(e.to_string()))?;
        let readonly = flags & rustix::fs::OFlags::ACCMODE == rustix::fs::OFlags::RDONLY;
        let path = std::fs::read_link(format!("/proc/self/fd/{}", file.as_raw_fd())).ok();
        let returned = if mode == "WRONG_HANDLE" { format!("{handle}wrong") } else { handle.clone() };
        let state = Arc::new(RequestState::default());
        if !["DENY", "STALL_CALL", "DISAPPEAR"].contains(&mode.as_str()) {
            connection.object_server().at(returned.as_str(), Request {root: self.0.clone(), path: returned.clone(), state: state.clone()}).await
                .map_err(|e| zbus::fdo::Error::Failed(e.to_string()))?;
        }
        let mut record = serde_json::json!({"method": "OpenURI.Request", "mode": mode, "parent": parent,
            "handle": handle, "returnedHandle": returned, "sender": sender,
            "ask": options.get("ask").and_then(|v| bool::try_from(v).ok()),
            "writable": options.get("writable").and_then(|v| bool::try_from(v).ok()),
            "readOnlyFd": readonly, "fdFlags": flags.bits(), "path": path});
        log(&self.0, record.clone())?;
        let connection = zbus::blocking::Connection::from(connection.clone());
        let root = self.0.clone(); let worker_mode = mode.clone();
        std::thread::spawn(move || {
            // The method returns its live Request promptly. Read the owned FD on this worker before any Response.
            let mut hash = Sha256::new(); let mut bytes = 0u64; let mut buffer = [0u8; 16384];
            loop {
                if state.closed.load(Ordering::Acquire) {
                    let _ = log(&root, serde_json::json!({"method": "FD.HashCancelled", "handle": handle, "bytes": bytes}));
                    return;
                }
                // Test-only gate for cancellation while this worker still owns an unconsumed descriptor.
                while root.join("hold-hash").exists() {
                    if state.closed.load(Ordering::Acquire) {
                        let _ = log(&root, serde_json::json!({"method": "FD.HashCancelled", "handle": handle, "bytes": bytes}));
                        return;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
                let count = match file.read(&mut buffer) {
                    Ok(count) => count,
                    Err(error) => {
                        let _ = log(&root, serde_json::json!({"method": "FD.ReadError", "handle": handle, "error": error.to_string()}));
                        respond(&connection, &root, &handle, &sender, &state, 2);
                        return;
                    }
                };
                if count == 0 { break; }
                bytes += count as u64; hash.update(&buffer[..count]);
            }
            record["method"] = serde_json::json!("OpenURI.OpenFile");
            record["bytes"] = serde_json::json!(bytes); record["sha256"] = serde_json::json!(format!("{:x}", hash.finalize()));
            if log(&root, record).is_err() { return; }
            if ["DENY", "STALL_CALL", "STALL", "DISAPPEAR", "WRONG_HANDLE"].contains(&worker_mode.as_str()) { return; }
            std::thread::sleep(std::time::Duration::from_millis(25));
            if worker_mode == "WRONG_SENDER" {
                {
                    let Ok(_gate) = state.response_gate.lock() else { return };
                    if state.closed.load(Ordering::Acquire) { return; }
                    let result: HashMap<&str, Value> = HashMap::new();
                    let other = zbus::blocking::Connection::session().unwrap();
                    other.emit_signal(Some(sender.as_str()), handle.as_str(), "org.freedesktop.portal.Request", "Response", &(0u32, &result)).unwrap();
                    log(&root, serde_json::json!({"method": "Forged.Response", "handle": handle,
                        "forgedSender": other.unique_name().map(|s| s.as_str()), "portalSender": connection.unique_name().map(|s| s.as_str())})).unwrap();
                }
                std::thread::sleep(std::time::Duration::from_millis(75));
            }
            let code = match worker_mode.as_str() { "OPEN" | "SUCCESS_BEFORE_RETURN" | "SUCCESS_WITHOUT_RETURN" => 0u32, "REFUSE" => 2u32, _ => 1u32 };
            respond(&connection, &root, &handle, &sender, &state, code);
        });
        if mode == "DENY" { return Err(zbus::fdo::Error::AccessDenied("fixture refusal".into())); }
        if mode == "STALL_CALL" || mode == "SUCCESS_WITHOUT_RETURN" { std::future::pending::<()>().await; }
        if mode == "SUCCESS_BEFORE_RETURN" { wait_until_removed(self.0.join("hold-open-return")).await; }
        returned.try_into().map_err(|e: zbus::zvariant::Error| zbus::fdo::Error::Failed(e.to_string()))
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::var("PORTAL_FIXTURE")?);
    let _connection = zbus::blocking::connection::Builder::session()?
        .name("org.freedesktop.portal.Desktop")?
        .serve_at("/org/freedesktop/portal/desktop", Chooser(root.clone()))?
        .serve_at("/org/freedesktop/portal/desktop", OpenUri(root.clone()))?
        .build()?;
    std::fs::write(root.join("ready"), b"fixture only\n")?;
    loop { std::thread::park(); }
}
