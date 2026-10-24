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
    "No file chooser is available. Open a file from your file manager or run rapier-linux with its path, or install xdg-desktop-portal and its backend for your desktop.";

/// A path, '' when the person cancelled, or an error when no portal answers: never a silent cancel.
/// The chooser opens in `start` (the portal's current_folder).
pub fn pick(save: bool, name: &str, title: &str, directory: bool, start: &std::path::Path, parent: &str) -> Result<String, String> {
    pick_inner(save, name, title, directory, start, parent).map_err(|_| NO_CHOOSER.to_string())
}

fn pick_inner(save: bool, name: &str, title: &str, directory: bool, start: &std::path::Path, parent: &str) -> zbus::Result<String> {
    let connection = Connection::session()?;
    let sender = connection
        .unique_name()
        .map(|n| n.trim_start_matches(':').replace('.', "_"))
        .unwrap_or_default();
    let token = format!("rapier{}", crate::random_hex(8));
    let handle = format!("/org/freedesktop/portal/desktop/request/{sender}/{token}");
    // Subscribed before the call, so an answer can never come first. The signal is waited for on a thread of its own, and
    // the Request object is checked while we wait (below).
    let rule = zbus::MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .interface("org.freedesktop.portal.Request")?
        .member("Response")?
        .path(handle.as_str())?
        .build();
    let mut responses = zbus::blocking::MessageIterator::for_match_rule(rule, &connection, Some(1))?;
    let mut options: HashMap<&str, Value> = HashMap::new();
    options.insert("handle_token", Value::from(token.as_str()));
    options.insert("modal", Value::from(true));
    if directory {
        options.insert("directory", Value::from(true));
    }
    if save {
        options.insert("current_name", Value::from(name));
    }
    // current_folder is a NUL-terminated byte path (xdg-desktop-portal FileChooser).
    let mut folder = std::os::unix::ffi::OsStrExt::as_bytes(start.as_os_str()).to_vec();
    if start.is_dir() && !folder.is_empty() {
        folder.push(0);
        options.insert("current_folder", Value::from(folder));
    }
    let chooser = Proxy::new(
        &connection,
        "org.freedesktop.portal.Desktop",
        "/org/freedesktop/portal/desktop",
        "org.freedesktop.portal.FileChooser",
    )?;
    let request: OwnedObjectPath = chooser.call(
        if save { "SaveFile" } else { "OpenFile" },
        &(parent, title, options),
    )?;
    let (answer, answered) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = answer.send(responses.next());
    });
    let message = loop {
        match answered.recv_timeout(std::time::Duration::from_secs(2)) {
            Ok(Some(Ok(message))) => break message,
            Ok(_) => return Ok(String::new()),
            Err(_) => {
                // The person may browse for minutes; but a Request the portal no longer has (its backend died or showed
                // nothing) never answers, and that is told, never left silent.
                // A portal that does not answer at all (hung, or restarting) is as gone as a Request it no longer has.
                let (asked, replied) = std::sync::mpsc::channel();
                let (peer, path) = (connection.clone(), request.to_string());
                std::thread::spawn(move || {
                    let _ = asked.send(Proxy::new(&peer, "org.freedesktop.portal.Desktop", path.as_str(), "org.freedesktop.DBus.Introspectable")
                        .and_then(|p| p.call::<_, _, String>("Introspect", &()))
                        .is_ok());
                });
                let alive = replied.recv_timeout(std::time::Duration::from_secs(3)).unwrap_or(false);
                if !alive {
                    match answered.recv_timeout(std::time::Duration::from_millis(500)) {
                        Ok(Some(Ok(message))) => break message,
                        _ => return Err(zbus::Error::Failure("the file chooser went away".into())),
                    }
                }
            }
        }
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

/// Tell the person something when no terminal shows stderr (a launcher start): a desktop notification
/// (org.freedesktop.Notifications, which mako, dunst, GNOME and KDE all serve), else a zenity or kdialog box.
pub fn tell(summary: &str, body: &str) {
    let notified = (|| -> zbus::Result<u32> {
        let connection = Connection::session()?;
        let notifications = Proxy::new(
            &connection,
            "org.freedesktop.Notifications",
            "/org/freedesktop/Notifications",
            "org.freedesktop.Notifications",
        )?;
        let actions: Vec<&str> = Vec::new();
        let hints: HashMap<&str, Value> = HashMap::new();
        notifications.call("Notify", &("Rapier", 0u32, "rapier", summary, body, actions, hints, 0i32))
    })();
    if notified.is_ok() {
        return;
    }
    let text = format!("{summary}\n\n{body}");
    for (tool, args) in [
        ("zenity", vec!["--error", "--title=Rapier", "--no-markup", "--text"]),
        ("kdialog", vec!["--title", "Rapier", "--error"]),
    ] {
        if let Some(path) = crate::which(tool) {
            if std::process::Command::new(path).args(&args).arg(&text).status().is_ok() {
                return;
            }
        }
    }
}

/// The portal's `parent_window` for the Rapier window of this browser process on an X11 display: "x11:<xid in hex>", so the chooser is
/// transient for it (modal over the window, never hidden behind it). Of several windows of the process the one with the input focus,
/// else the first; "" when no display answers or no window is found. On Wayland the parent would have to be exported by the browser
/// itself (xdg-foreign), which another process cannot do, so the host passes "" there.
pub fn x11_parent(pid: u32) -> String {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt, MapState, Window};
    let Ok((conn, screen)) = x11rb::connect(None) else { return String::new() };
    let root = conn.setup().roots[screen].root;
    let atom = |name: &str| conn.intern_atom(false, name.as_bytes()).ok().and_then(|c| c.reply().ok()).map(|r| r.atom);
    let Some(pid_atom) = atom("_NET_WM_PID") else { return String::new() };
    let owned = |window: Window| -> bool {
        let pid_ok = conn.get_property(false, window, pid_atom, AtomEnum::CARDINAL, 0, 1).ok().and_then(|c| c.reply().ok())
            .and_then(|r| r.value32().and_then(|mut v| v.next())) == Some(pid);
        let class_ok = conn.get_property(false, window, AtomEnum::WM_CLASS, AtomEnum::STRING, 0, 64).ok().and_then(|c| c.reply().ok())
            .is_some_and(|r| String::from_utf8_lossy(&r.value).split('\0').any(|part| part == "rapier"));
        let mapped = conn.get_window_attributes(window).ok().and_then(|c| c.reply().ok()).is_some_and(|a| a.map_state == MapState::VIEWABLE);
        pid_ok && class_ok && mapped
    };
    // The windows of this process: top-level, or one level down where a window manager has put a frame around them.
    let mut found: Vec<Window> = Vec::new();
    for top in conn.query_tree(root).ok().and_then(|c| c.reply().ok()).map(|r| r.children).unwrap_or_default() {
        if owned(top) {
            found.push(top);
        } else {
            for child in conn.query_tree(top).ok().and_then(|c| c.reply().ok()).map(|r| r.children).unwrap_or_default() {
                if owned(child) {
                    found.push(child);
                }
            }
        }
    }
    // The focus may be the window or a child of it.
    let focus = conn.get_input_focus().ok().and_then(|c| c.reply().ok()).map(|r| r.focus);
    let chosen = focus
        .and_then(|mut w| {
            for _ in 0..4 {
                if found.contains(&w) {
                    return Some(w);
                }
                w = conn.query_tree(w).ok()?.reply().ok()?.parent;
            }
            None
        })
        .or_else(|| found.first().copied());
    chosen.map(|w| format!("x11:{w:x}")).unwrap_or_default()
}
