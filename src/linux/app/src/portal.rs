// SPDX-License-Identifier: AGPL-3.0-only
// The desktop's own file chooser (xdg-desktop-portal, which Omarchy and every current desktop provide).
use std::collections::HashMap;
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::{OwnedObjectPath, OwnedValue, Value};

pub fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(value) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("zz"),
                16,
            ) {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// What a person reads when no file chooser answers (no xdg-desktop-portal or no backend for the desktop).
pub const NO_CHOOSER: &str =
    "No file chooser is available. Install xdg-desktop-portal and its backend for your desktop.";

/// A path, '' when the person cancelled, or an error when no portal answers: never a silent cancel.
pub fn pick(save: bool, name: &str, title: &str, directory: bool) -> Result<String, String> {
    pick_inner(save, name, title, directory).map_err(|_| NO_CHOOSER.to_string())
}

fn pick_inner(save: bool, name: &str, title: &str, directory: bool) -> zbus::Result<String> {
    let connection = Connection::session()?;
    let sender = connection
        .unique_name()
        .map(|n| n.trim_start_matches(':').replace('.', "_"))
        .unwrap_or_default();
    let token = format!("rapier{}", crate::random_hex(8));
    let handle = format!("/org/freedesktop/portal/desktop/request/{sender}/{token}");
    let request = Proxy::new(
        &connection,
        "org.freedesktop.portal.Desktop",
        handle.as_str(),
        "org.freedesktop.portal.Request",
    )?;
    let mut responses = request.receive_signal("Response")?;
    let mut options: HashMap<&str, Value> = HashMap::new();
    options.insert("handle_token", Value::from(token.as_str()));
    options.insert("modal", Value::from(true));
    if directory {
        options.insert("directory", Value::from(true));
    }
    if save {
        options.insert("current_name", Value::from(name));
    }
    let chooser = Proxy::new(
        &connection,
        "org.freedesktop.portal.Desktop",
        "/org/freedesktop/portal/desktop",
        "org.freedesktop.portal.FileChooser",
    )?;
    let _: OwnedObjectPath = chooser.call(
        if save { "SaveFile" } else { "OpenFile" },
        &("", title, options),
    )?;
    let Some(message) = responses.next() else {
        return Ok(String::new());
    };
    let (code, results): (u32, HashMap<String, OwnedValue>) = message.body().deserialize()?;
    if code != 0 {
        return Ok(String::new());
    }
    let uris: Vec<String> = results
        .get("uris")
        .and_then(|v| Vec::<String>::try_from(v.try_clone().ok()?).ok())
        .unwrap_or_default();
    Ok(uris
        .first()
        .and_then(|uri| uri.strip_prefix("file://"))
        .map(percent_decode)
        .unwrap_or_default())
}
