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
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;

pub const ORIGIN: &str = "https://rapier.local";
/// What a launch asks the window to open besides files: a new document, or text read from stdin (`-`).
pub const NEW_DOCUMENT: &str = "rapier:new";
pub const STDIN_DOCUMENT: &str = "rapier:stdin:";
/// Omarchy's theme-set and font-set hooks (payload::install) send this to a running rapier.
pub const THEME_CHANGED: &str = "rapier:theme";
/// A window reopened for the unsaved work it held, by its number (host.rs unsaved_windows).
pub const SLOT: &str = "rapier:slot:";
/// A launch with nothing to open while Rapier runs: its window comes to the front.
pub const FOCUS: &str = "rapier:focus";
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

/// Print to stdout and stop quietly if the reader went away (`rapier-linux --licenses | head`).
fn say(text: &str) {
    let mut out = std::io::stdout().lock();
    let _ = out.write_all(text.as_bytes()).and_then(|_| out.flush());
}

const USAGE: &str = "Usage: rapier-linux [--online] [--new] [FILE... | -]";

fn fail(message: &str) -> ! {
    eprintln!("Rapier: {message}");
    // Started from the launcher, nobody reads stderr: the person is told on the desktop too.
    if unsafe { libc::isatty(2) } == 0 {
        portal::tell("Rapier could not start", message);
    }
    std::process::exit(1)
}

/// stdin, set aside in a private file (0600, in XDG_RUNTIME_DIR) for the window to open as a new document.
fn stdin_document() -> String {
    let mut text = Vec::new();
    std::io::stdin().take(64 * 1024 * 1024).read_to_end(&mut text).unwrap_or_else(|error| fail(&error.to_string()));
    let folder = std::env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from).filter(|d| d.is_dir()).unwrap_or_else(std::env::temp_dir);
    let path = folder.join(format!("rapier-stdin-{}.md", random_hex(8)));
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)
        .unwrap_or_else(|error| fail(&error.to_string()));
    file.write_all(&text).unwrap_or_else(|error| fail(&error.to_string()));
    format!("{STDIN_DOCUMENT}{}", path.display())
}

/// The installed Chromium-based browser: RAPIER_BROWSER, then each name on PATH, then the usual install paths (a
/// launcher's PATH can be short). Snap Chromium is used with a profile its confinement allows (browser_profile).
fn find_browser() -> Option<PathBuf> {
    if let Some(named) = std::env::var_os("RAPIER_BROWSER") {
        return Some(PathBuf::from(named));
    }
    BROWSERS.iter().find_map(|name| which(name)).or_else(|| {
        [
            "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/lib/chromium/chromium",
            "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome", "/opt/brave.com/brave/brave",
            "/opt/microsoft/msedge/msedge", "/opt/vivaldi/vivaldi", "/snap/bin/chromium",
        ]
        .iter()
        .map(PathBuf::from)
        .find(|path| path.is_file())
    })
}

/// The command that installs Chromium here, from os-release (Ubuntu's Chromium is the snap), or None where rapier
/// cannot tell. Omarchy is Arch.
fn chromium_hint() -> Option<&'static str> {
    let text = std::fs::read_to_string("/etc/os-release").or_else(|_| std::fs::read_to_string("/usr/lib/os-release")).unwrap_or_default();
    let field = |key: &str| text.lines().find_map(|l| l.strip_prefix(key)).unwrap_or("").trim_matches('"').to_lowercase();
    let ids = format!("{} {}", field("ID="), field("ID_LIKE="));
    let has = |id: &str| ids.split_whitespace().any(|w| w == id);
    if has("ubuntu") {
        Some("sudo snap install chromium")
    } else if has("debian") {
        Some("sudo apt install chromium")
    } else if has("arch") || home().join(".config/omarchy").is_dir() {
        Some("sudo pacman -S chromium")
    } else if has("fedora") || has("rhel") {
        Some("sudo dnf install chromium")
    } else if has("suse") || has("opensuse") {
        Some("sudo zypper install chromium")
    } else {
        None
    }
}

/// What to say when no browser is found: a Flatpak Chromium is named, since it cannot take the private pipe rapier
/// talks to its window over.
fn no_browser() -> String {
    let flatpak = ["/var/lib/flatpak", &format!("{}/.local/share/flatpak", home().display())]
        .iter()
        .any(|root| Path::new(root).join("app/org.chromium.Chromium").is_dir());
    let install = match chromium_hint() {
        Some(command) => format!("Install Chromium ({command})"),
        None => "Install Chromium".to_string(),
    };
    let mut message = format!("no Chromium-based browser found; Rapier opens its window in one. {install}, or Chrome, Brave, Edge, Vivaldi or Helium, then open Rapier again.");
    if flatpak {
        message.push_str(" The Flatpak Chromium cannot host Rapier's window; install your distribution's Chromium package.");
    }
    message
}

/// The display the window opens on: Wayland when its socket answers, else X11. A session that says Wayland but has
/// no Wayland display (Chrome died and rapier exited 0) opens on X11 when it can.
pub fn display_platform() -> Result<&'static str, String> {
    let set = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty());
    if let Some(name) = set("WAYLAND_DISPLAY") {
        let socket = PathBuf::from(&name);
        let socket = if socket.is_absolute() { socket } else { set("XDG_RUNTIME_DIR").map(PathBuf::from).unwrap_or_default().join(socket) };
        // A socket left by a compositor that crashed or a session that ended refuses the connection.
        if UnixStream::connect(&socket).is_ok() {
            return Ok("wayland");
        }
        if set("DISPLAY").is_none() {
            return Err(format!("the Wayland display {} does not answer (WAYLAND_DISPLAY), and no X display is set. Start Rapier from your desktop session.",
                name.to_string_lossy()));
        }
    }
    if let Some(display) = set("DISPLAY") {
        // A local X display (":N") answers on its socket; one that does not is named, not left to the browser to fail on
        // (otherwise the browser fails and says only that it closed). A remote display (host:N) is left to the browser.
        let shown = display.to_string_lossy().into_owned();
        let local = shown.strip_prefix(':').and_then(|n| n.split('.').next()).and_then(|n| n.parse::<u32>().ok());
        if let Some(number) = local {
            let socket = format!("/tmp/.X11-unix/X{number}");
            let abstract_name = SocketAddr::from_abstract_name(socket.as_bytes()).ok();
            let answers = UnixStream::connect(&socket).is_ok() || abstract_name.is_some_and(|a| UnixStream::connect_addr(&a).is_ok());
            if !answers {
                return Err(format!("the X display {shown} does not answer (DISPLAY={shown}). Start Rapier from your desktop session."));
            }
        }
        return Ok("x11");
    }
    Err("no desktop display to open the window on (neither a Wayland display nor DISPLAY). Start Rapier from your desktop session.".into())
}

/// One window: a second launch hands its paths to the first and exits.
fn instance_address() -> SocketAddr {
    let name = format!("rapier-{}", unsafe { libc::getuid() });
    SocketAddr::from_abstract_name(name.as_bytes()).expect("socket name")
}

fn single_instance(paths: &[String]) -> UnixListener {
    let address = instance_address();
    match UnixListener::bind_addr(&address) {
        Ok(listener) => listener,
        Err(_) => {
            if let Ok(mut client) = UnixStream::connect_addr(&address) {
                let asked: Vec<String> = if paths.is_empty() { vec![FOCUS.to_string()] } else { paths.to_vec() };
                let _ = client.write_all(serde_json::to_string(&asked).unwrap_or_default().as_bytes());
                if paths.is_empty() {
                    eprintln!("Rapier is already open; its window is brought to the front.");
                }
                std::process::exit(0);
            }
            fail("another Rapier is starting; try again in a moment.")
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
            say(&format!("Rapier {}\n", payload::version()));
            return;
        }
        Some("--theme-changed") => {
            // From Omarchy's hook: tell a running rapier; never start one.
            if let Ok(mut client) = UnixStream::connect_addr(&instance_address()) {
                let _ = client.write_all(serde_json::to_string(&[THEME_CHANGED]).unwrap_or_default().as_bytes());
            }
            return;
        }
        Some("--help") | Some("-h") => {
            say(&format!(
                "Rapier {} — Markdown editor, notes, drawing and painting, offline.\n\n\
                 {USAGE}\n\n\
                 \x20 FILE...      open these files (.md, .markdown, .txt, .rapier.html)\n\
                 \x20 -            open the text on standard input as a new document\n\
                 \x20 --new        open a new document\n\
                 \x20 --online     let the app use the network (it starts offline)\n\
                 \x20 --install    add Rapier to your app launcher and make it open Markdown\n\
                 \x20 --uninstall  remove the launcher entry and the unpacked cache (documents stay)\n\
                 \x20 --licenses   print the included license notices\n\
                 \x20 --version    print the version\n\
                 \x20 -h, --help   print this help\n",
                payload::version()
            ));
            return;
        }
        _ => {}
    }
    if args.first().map(String::as_str) == Some("--install") {
        let app = payload::unpacked().unwrap_or_else(|error| fail(&error));
        payload::install(&app).unwrap_or_else(|error| fail(&error));
        // Installed, but nothing to open the window in yet: say what to install first.
        if find_browser().is_none() {
            let command = chromium_hint().map(|c| format!(" ({c})")).unwrap_or_default();
            println!("Install a Chromium-based browser before you open Rapier: Chromium{command}, Chrome, Brave, Edge, Vivaldi or Helium.");
        }
        return;
    }
    if args.first().map(String::as_str) == Some("--licenses") {
        let app = payload::unpacked().unwrap_or_else(|error| fail(&error));
        say(&std::fs::read_to_string(app.join("LICENSES.txt")).unwrap_or_else(|error| fail(&error.to_string())));
        return;
    }
    // An option rapier does not know is a mistake, never a file name (`--` ends the options).
    let mut options = true;
    for arg in &args {
        if arg == "--" {
            options = false;
        } else if options && arg.starts_with('-') && arg != "-" && !["--online", "--new"].contains(&arg.as_str()) {
            eprintln!("Rapier: unknown option {arg}\n{USAGE}\nrapier-linux --help lists every option.");
            std::process::exit(2);
        }
    }
    let online = args.iter().any(|a| a == "--online");
    let paths: Vec<String> = args
        .iter()
        .scan(true, |options, a| {
            let option = *options;
            if a == "--" {
                *options = false;
            }
            Some((option, a))
        })
        .filter(|(option, a)| !(*option && (a.as_str() == "--online" || a.as_str() == "--")))
        .map(|(option, a)| match a.as_str() {
            _ if !option => absolute(a),
            "--new" => NEW_DOCUMENT.to_string(),
            "-" => stdin_document(),
            _ => absolute(a),
        })
        .collect();
    // A folder is not a document: say so before anything starts.
    if let Some(folder) = paths.iter().find(|p| Path::new(p.as_str()).is_dir()) {
        eprintln!("Rapier: {folder} is a folder; open a file in it.");
        std::process::exit(2);
    }
    let listener = single_instance(&paths);
    let app = payload::unpacked().unwrap_or_else(|error| fail(&error));
    let browser = find_browser().unwrap_or_else(|| fail(&no_browser()));
    let (sender, receiver) = std::sync::mpsc::channel();
    accept_forever(listener, sender.clone());
    let mut host = host::Host::launch(app, &browser, online, paths, sender)
        .unwrap_or_else(|error| fail(&error));
    if let Err(error) = host.run(receiver) {
        host.close_folder();
        fail(&error);
    }
    host.close_folder();
}
