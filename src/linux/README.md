# rapier for Linux

`rapier-linux` carries the editor, Notes, drawing, math, PDF, and other resources in one executable. It opens an app window in your installed Chromium-compatible browser. Python, Electron, and a bundled browser are not required.

The download targets **x86_64 Linux**. Check `rapier-linux.json` beside it for the executable's SHA-256 and minimum glibc version. Original folders require Linux 5.6 or newer and a supported local filesystem: ext, XFS, Btrfs, tmpfs, or overlayfs. Network filesystems and FUSE folders are refused.

Install a current Chromium-compatible browser. File and folder choosers need a session D-Bus, `xdg-desktop-portal`, and a backend for your desktop. Omarchy theme colors are followed automatically; `fontconfig` supplies its chosen monospace font.

```sh
chmod +x rapier-linux
./rapier-linux --install
./rapier-linux
```

Keep the executable where you installed it. After moving it, run `--install` again. `--uninstall` removes the launcher entry and extracted cache; documents and Notes remain. `--licenses` prints the included license notices.

The app serves its bundled files through a private browser pipe. It starts with a disabled network proxy; `--online` allows network use. This is not an operating-system network sandbox.

Original-folder saves check the pinned file, parent, version, and bytes before replacing it. A detected outside edit keeps the original and creates an exclusive edited copy. This is a checked save, not a filesystem compare-and-swap operation. Never treat a refusal as a successful save.

To build from the source tree, use the Node version in `tools/toolchain.json`, Rust, Cargo, GNU tar, and binutils:

```sh
RAPIER_PROFILE=reader node tools/build.mjs
node tools/build.mjs
node tools/stage-linux.mjs --single dist/linux/rapier-linux
node tools/stage-linux.mjs --verify
```

The stager verifies the page's existing build receipt and resource pins. A changed page, resource, native source, or executable invalidates the Linux manifest. Public staging copies only a verified executable and its manifest.
