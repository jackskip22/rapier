// SPDX-License-Identifier: AGPL-3.0-only
// rapier for Linux as one file. The page, its parts and the plug-ins travel inside this executable (a gzip'd tar,
// tools/stage-linux.mjs --single); the first start unpacks them once into the person's cache, keyed by their hash.
// rapier then opens as an app window in the person's own Chromium, as Omarchy runs its web apps, but offline: the page
// is served from https://rapier.local by the DevTools Fetch domain over a private pipe (no port, no server) and speaks
// the Windows host's contract (repo/windows/rapier.cpp): window.RapierHost and window.RapierIntake, each carrying
// {channel, payload} strings. This is linux/rapier (the Arch package's launcher) carried into one native program.
//   rapier-linux [files]       open rapier
//   rapier-linux --online      let the page reach the network (offline by default)
//   rapier-linux --install     add rapier to the app launcher and open Markdown and .rapier.html files with it
//   rapier-linux --uninstall   remove what --install added, and the unpacked cache
mod files;
mod folder;
mod host;
mod payload;
mod portal;
mod theme;

use std::io::{Read, Write};
use std::os::linux::net::SocketAddrExt;
use std::os::unix::net::{SocketAddr, UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;

pub const ORIGIN: &str = "https://rapier.local";
pub const PAGE: &str = "https://rapier.local/rapier.html";
const BROWSERS: [&str; 8] = [
    "chromium",
    "google-chrome-stable",
    "google-chrome",
    "brave",
    "brave-browser",
    "microsoft-edge-stable",
    "vivaldi-stable",
    "helium-browser",
];

pub enum Event {
    Cdp(serde_json::Value),
    Theme,
    Open(String),
    Exit,
}

pub fn home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

pub fn data_dir() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home().join(".local/share"))
}

pub fn which(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| {
            std::fs::metadata(candidate)
                .map(|m| {
                    m.is_file()
                        && std::os::unix::fs::PermissionsExt::mode(&m.permissions()) & 0o111 != 0
                })
                .unwrap_or(false)
        })
}

pub fn random_hex(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buffer))
        .expect("no randomness");
    buffer.iter().map(|b| format!("{b:02x}")).collect()
}

fn fail(message: &str) -> ! {
    eprintln!("rapier: {message}");
    std::process::exit(1)
}

/// One window: a second launch hands its paths to the first and exits.
fn single_instance(paths: &[String]) -> UnixListener {
    let name = format!("rapier-{}", unsafe { libc::getuid() });
    let address = SocketAddr::from_abstract_name(name.as_bytes()).expect("socket name");
    match UnixListener::bind_addr(&address) {
        Ok(listener) => listener,
        Err(_) => {
            if let Ok(mut client) = UnixStream::connect_addr(&address) {
                let _ =
                    client.write_all(serde_json::to_string(paths).unwrap_or_default().as_bytes());
                std::process::exit(0);
            }
            fail("another rapier is starting; try again in a moment")
        }
    }
}

fn accept_forever(listener: UnixListener, events: Sender<Event>) {
    std::thread::spawn(move || {
        for connection in listener.incoming().flatten() {
            let mut data = Vec::new();
            let _ = (&connection).take(1 << 20).read_to_end(&mut data);
            if let Ok(paths) = serde_json::from_slice::<Vec<String>>(&data) {
                for path in paths {
                    let _ = events.send(Event::Open(path));
                }
            }
        }
    });
}

fn absolute(arg: &str) -> String {
    let raw = match arg.strip_prefix("file://") {
        Some(rest) => portal::percent_decode(rest),
        None => arg.to_string(),
    };
    let path = Path::new(&raw);
    let joined = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    };
    files::normalize(&joined).to_string_lossy().into_owned()
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("--uninstall") => return payload::uninstall(),
        Some("--version") => {
            println!("rapier {}", payload::version());
            return;
        }
        _ => {}
    }
    if args.first().map(String::as_str) == Some("--install") {
        let app = payload::unpacked().unwrap_or_else(|error| fail(&error));
        return payload::install(&app).unwrap_or_else(|error| fail(&error));
    }
    if args.first().map(String::as_str) == Some("--licenses") {
        let app = payload::unpacked().unwrap_or_else(|error| fail(&error));
        print!(
            "{}",
            std::fs::read_to_string(app.join("LICENSES.txt"))
                .unwrap_or_else(|error| fail(&error.to_string()))
        );
        return;
    }
    let online = args.iter().any(|a| a == "--online");
    let paths: Vec<String> = args
        .iter()
        .filter(|a| a.as_str() != "--online")
        .map(|a| absolute(a))
        .collect();
    let listener = single_instance(&paths);
    let app = payload::unpacked().unwrap_or_else(|error| fail(&error));
    let browser = std::env::var_os("RAPIER_BROWSER").map(PathBuf::from)
        .or_else(|| BROWSERS.iter().find_map(|name| which(name)))
        .unwrap_or_else(|| fail("rapier needs Chromium or another Chromium-based browser (Chrome, Brave, Edge, Vivaldi, Helium)."));
    let (sender, receiver) = std::sync::mpsc::channel();
    accept_forever(listener, sender.clone());
    let mut host = host::Host::launch(app, &browser, online, paths, sender)
        .unwrap_or_else(|error| fail(&error));
    host.run(receiver);
    host.close_folder();
}
