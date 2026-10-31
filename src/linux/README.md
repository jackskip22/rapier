# rapier for Linux

`rapier-linux` carries the editor, Notes, drawing, math, PDF, and other resources in one executable. It opens an app window in your installed Chromium-compatible browser. Python, Electron, and a bundled browser are not required.

The download targets **x86_64 Linux**. Check `rapier-linux.json` beside it for the executable's SHA-256 and minimum glibc version. Original folders require Linux 5.6 or newer and a supported local filesystem: ext, XFS, Btrfs, tmpfs, or overlayfs. Network filesystems and FUSE folders are refused.

Install a current Chromium-compatible browser. File and folder choosers need a session D-Bus, `xdg-desktop-portal`, and a backend for your desktop. Omarchy theme colors and accent are followed automatically, and a theme switch reaches an open window at once through Omarchy's theme hooks; `fontconfig` supplies its chosen monospace font. Light or dark follows the desktop's color scheme (the portal's `color-scheme`, which GNOME, KDE and Omarchy set); `GTK_THEME=Adwaita:dark` alone does not change it.

```sh
chmod +x rapier-linux
./rapier-linux --install
./rapier-linux
```

`rapier-linux file.md` opens a file, `rapier-linux --new` a new document, and `printf '# Notes' | rapier-linux -` the text on standard input. While rapier is open, each further document opens in a window of its own. `--help` lists every option. If no Chromium-compatible browser is installed, rapier says so on the desktop and in the terminal.

On X11 the window's class is `rapier`. On Wayland, Chromium names an app window after its address and profile, so the class (app ID) is `chrome-rapier.local__rapier.html-Default`; `--install` adds a hidden launcher entry by that name so the window shows rapier's name and icon. To match it in a Hyprland window rule (Hyprland 0.53 syntax):

```
windowrule = opacity 1 1, match:class ^(chrome-rapier\.local__rapier\.html-Default)$
```

On Omarchy, `xdg-open file.md` needs `perl-file-mimeinfo` to open rapier; without it, `xdg-open` sees a `.md` file as plain text. The AUR package `rapier-bin` installs it; with the executable alone, run `sudo pacman -S perl-file-mimeinfo`. Your file manager opens `.md` files in rapier either way.

Keep the executable where you installed it. After moving it, run `--install` again. `--uninstall` removes the launcher entry and extracted cache; documents and Notes remain. `--licenses` prints the included license notices.

The app serves its bundled files through a private browser pipe. It starts with a disabled network proxy; `--online` allows network use. This is not an operating-system network sandbox.

Original-folder saves check the pinned file, parent, version, and bytes before replacing it. A detected outside edit keeps the original and creates an exclusive edited copy. This is a checked save, not a filesystem compare-and-swap operation. Never treat a refusal as a successful save.

To build from the source tree, use the Node version in `tools/toolchain.json` (at least Node 22.15: the build and the stager use `module.registerHooks`), Rust, Cargo, GNU tar, and binutils:

```sh
RAPIER_PROFILE=reader node tools/build.mjs
node tools/build.mjs
node tools/stage-linux.mjs --single dist/linux/rapier-linux
node tools/stage-linux.mjs --verify
```

The stager verifies the page's existing build receipt and resource pins. A changed page, resource, native source, or executable invalidates the Linux manifest. Public staging copies only a verified executable and its manifest.
