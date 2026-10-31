// SPDX-License-Identifier: AGPL-3.0-only
//! The window manager's name, so a tiling one is left to place and size windows itself.
//!
//! On X11 the running window manager names itself on the window `_NET_SUPPORTING_WM_CHECK` points to (`_NET_WM_NAME`).
//! libX11 is opened when needed, as every X desktop has it; Rapier does not link to it.

use std::ffi::{c_char, c_int, c_long, c_uchar, c_ulong, c_void, CStr};
use std::sync::OnceLock;

/// Window managers that tile, by the names they give themselves or their desktop.
const TILING: [&str; 15] = ["i3", "sway", "hyprland", "niri", "bspwm", "awesome", "river", "qtile", "xmonad", "dwm", "dwl",
    "herbstluftwm", "leftwm", "spectrwm", "ratpoison"];

/// Whether a tiling window manager runs: by its own socket, the desktop's name or, on X11, its own name.
pub fn tiling() -> bool {
    static TILES: OnceLock<bool> = OnceLock::new();
    *TILES.get_or_init(|| {
        let sockets = ["HYPRLAND_INSTANCE_SIGNATURE", "SWAYSOCK", "I3SOCK", "NIRI_SOCKET"];
        let desktops = ["XDG_CURRENT_DESKTOP", "XDG_SESSION_DESKTOP", "DESKTOP_SESSION"]
            .iter()
            .filter_map(|name| std::env::var(name).ok())
            .collect::<Vec<_>>();
        sockets.iter().any(|name| std::env::var_os(name).is_some())
            || desktops.iter().chain(x11_name().iter()).any(|names| names.split([':', ';']).any(named_tiling))
    })
}

fn named_tiling(name: &str) -> bool {
    let name = name.trim().to_ascii_lowercase();
    TILING.iter().any(|tiler| name == *tiler || name.starts_with(&format!("{tiler} ")) || name.starts_with(&format!("{tiler}-")))
}

type OpenDisplay = unsafe extern "C" fn(*const c_char) -> *mut c_void;
type CloseDisplay = unsafe extern "C" fn(*mut c_void) -> c_int;
type DefaultRoot = unsafe extern "C" fn(*mut c_void) -> c_ulong;
type InternAtom = unsafe extern "C" fn(*mut c_void, *const c_char, c_int) -> c_ulong;
type GetProperty = unsafe extern "C" fn(*mut c_void, c_ulong, c_ulong, c_long, c_long, c_int, c_ulong, *mut c_ulong, *mut c_int,
    *mut c_ulong, *mut c_ulong, *mut *mut c_uchar) -> c_int;
type Free = unsafe extern "C" fn(*mut c_void) -> c_int;

/// The X11 window manager's own name, when DISPLAY names one that answers and it names itself.
fn x11_name() -> Option<String> {
    std::env::var_os("DISPLAY")?;
    unsafe {
        let library = libc::dlopen(c"libX11.so.6".as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL);
        if library.is_null() {
            return None;
        }
        let symbol = |name: &CStr| libc::dlsym(library, name.as_ptr());
        let symbols = [symbol(c"XOpenDisplay"), symbol(c"XCloseDisplay"), symbol(c"XDefaultRootWindow"), symbol(c"XInternAtom"),
            symbol(c"XGetWindowProperty"), symbol(c"XFree")];
        let name = if symbols.iter().any(|s| s.is_null()) {
            None
        } else {
            let open: OpenDisplay = std::mem::transmute(symbols[0]);
            let close: CloseDisplay = std::mem::transmute(symbols[1]);
            let root: DefaultRoot = std::mem::transmute(symbols[2]);
            let atom: InternAtom = std::mem::transmute(symbols[3]);
            let property: GetProperty = std::mem::transmute(symbols[4]);
            let free: Free = std::mem::transmute(symbols[5]);
            let display = open(std::ptr::null());
            if display.is_null() {
                None
            } else {
                // One property of one window: its bytes, or none.
                let read = |window: c_ulong, name: &CStr, kind: &CStr| -> Option<Vec<u8>> {
                    let (wanted, kind) = (atom(display, name.as_ptr(), 1), atom(display, kind.as_ptr(), 0));
                    if wanted == 0 {
                        return None;
                    }
                    let (mut actual, mut format, mut items, mut after, mut data) = (0, 0, 0, 0, std::ptr::null_mut());
                    if property(display, window, wanted, 0, 1024, 0, kind, &mut actual, &mut format, &mut items, &mut after, &mut data) != 0
                        || data.is_null()
                    {
                        return None;
                    }
                    // Xlib hands 32-bit items back as C longs.
                    let size = if format == 32 { std::mem::size_of::<c_long>() } else { format as usize / 8 };
                    let bytes = std::slice::from_raw_parts(data, items as usize * size).to_vec();
                    free(data.cast());
                    Some(bytes)
                };
                let check = read(root(display), c"_NET_SUPPORTING_WM_CHECK", c"WINDOW")
                    .and_then(|b| b.get(..std::mem::size_of::<c_ulong>()).map(|b| c_ulong::from_ne_bytes(b.try_into().unwrap())));
                let name = check
                    .and_then(|window| read(window, c"_NET_WM_NAME", c"UTF8_STRING"))
                    .map(|bytes| String::from_utf8_lossy(&bytes).into_owned());
                close(display);
                name
            }
        };
        libc::dlclose(library);
        name
    }
}

#[cfg(test)]
mod tests {
    use super::named_tiling;

    #[test]
    fn tiling_names() {
        for name in ["bspwm", "i3", "Hyprland", "qtile", "LG3D xmonad", "awesome v4.3", "river"] {
            assert_eq!(named_tiling(name), !name.starts_with("LG3D"), "{name}");
        }
        for name in ["GNOME", "xfwm4", "KWin", "Openbox", "ubuntu:GNOME"] {
            assert!(!named_tiling(name), "{name}");
        }
    }
}
