// SPDX-License-Identifier: AGPL-3.0-only
// Test-only xdg-desktop-portal FileChooser service. Run under an isolated dbus-run-session.
// PORTAL_FIXTURE/next contains an absolute synthetic path, or CANCEL. No desktop UI is claimed.
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use zbus::message::Header;
use zbus::zvariant::{OwnedObjectPath, OwnedValue, Value};

struct Chooser(PathBuf);
impl Chooser {
    fn answer(
        &self,
        kind: &str,
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
        if chosen != "CANCEL" && !chosen.starts_with('/') {
            return Err(zbus::fdo::Error::InvalidArgs("fixture path must be absolute".into()));
        }
        let mut log = std::fs::OpenOptions::new()
            .create(true).append(true).open(self.0.join("requests.jsonl")).unwrap();
        writeln!(log, "{}", serde_json::json!({
            "method": kind, "chosen": chosen,
            "directory": options.get("directory").and_then(|v| bool::try_from(v).ok()).unwrap_or(false),
            "currentFolder": options.get("current_folder").and_then(|v| v.try_clone().ok())
                .and_then(|v| Vec::<u8>::try_from(v).ok())
                .map(|bytes| String::from_utf8_lossy(bytes.strip_suffix(&[0]).unwrap_or(&bytes)).into_owned())
        })).unwrap();
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
    fn open_file(
        &self, _parent: &str, _title: &str, options: HashMap<String, OwnedValue>,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &zbus::Connection,
    ) -> zbus::fdo::Result<OwnedObjectPath> {
        self.answer("OpenFile", options, header, connection)
    }
    fn save_file(
        &self, _parent: &str, _title: &str, options: HashMap<String, OwnedValue>,
        #[zbus(header)] header: Header<'_>,
        #[zbus(connection)] connection: &zbus::Connection,
    ) -> zbus::fdo::Result<OwnedObjectPath> {
        self.answer("SaveFile", options, header, connection)
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::var("PORTAL_FIXTURE")?);
    let _connection = zbus::blocking::connection::Builder::session()?
        .name("org.freedesktop.portal.Desktop")?
        .serve_at("/org/freedesktop/portal/desktop", Chooser(root.clone()))?
        .build()?;
    std::fs::write(root.join("ready"), b"fixture only\n")?;
    loop { std::thread::park(); }
}
