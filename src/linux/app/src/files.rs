// SPDX-License-Identifier: AGPL-3.0-only
// Reading, verified saving and exclusive new copies, as linux/rapier does them.
use rustix::fs::{self as rfs, Mode, OFlags, ResolveFlags};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Component, Path, PathBuf};

pub const MAX_DOCUMENT: u64 = 64 * 1024 * 1024;

pub fn read_document(reader: impl Read) -> std::io::Result<Vec<u8>> {
    let mut data = Vec::new();
    reader.take(MAX_DOCUMENT + 1).read_to_end(&mut data)?;
    if data.len() as u64 > MAX_DOCUMENT {
        return Err(std::io::Error::other("the file is larger than 64 MiB"));
    }
    Ok(data)
}

pub fn sha256(data: &[u8]) -> String {
    Sha256::digest(data)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// A path with `.` and `..` resolved lexically, as Python's os.path.abspath does.
pub fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::from("/");
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(part) => out.push(part),
            _ => {}
        }
    }
    out
}

fn generation(meta: &fs::Metadata, length: usize, digest: &str) -> String {
    let mtime_ns = meta.mtime() as i128 * 1_000_000_000 + meta.mtime_nsec() as i128;
    format!(
        "{:x}:{:x}:{:x}:{:x}:{}",
        meta.dev(),
        meta.ino(),
        length,
        mtime_ns,
        digest
    )
}

/// The file's bytes and its generation: identity, size, mtime and content hash.
pub fn read_snapshot(path: &str) -> std::io::Result<(Vec<u8>, String)> {
    let file = File::open(path)?;
    let meta = file.metadata()?;
    if !meta.is_file() {
        return Err(std::io::Error::other("not a regular file"));
    }
    if meta.len() > MAX_DOCUMENT {
        return Err(std::io::Error::other("the file is larger than 64 MiB"));
    }
    let data = read_document(file)?;
    let digest = sha256(&data);
    Ok((data.clone(), generation(&meta, data.len(), &digest)))
}

pub fn generation_of(path: &str) -> String {
    read_snapshot(path).map(|(_, g)| g).unwrap_or_default()
}

pub fn authority_for(path: &str) -> String {
    format!("linux:{}", sha256(path.as_bytes()))
}

fn fsync_dir(dir: &Path) -> std::io::Result<()> {
    File::open(dir)?.sync_all()
}

fn copy_attributes(source: &File, target: &File) -> std::io::Result<()> {
    // Linux bounds each value and the complete name list to 64 KiB. Refuse an
    // unreadable or uncopyable attribute before replacing the original file.
    let mut names = vec![0; 65536];
    let size = match rfs::flistxattr(source, &mut names[..]) {
        Ok(size) => size,
        Err(rustix::io::Errno::NOTSUP) => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    let mut value = vec![0; 65536];
    for name in names[..size].split(|byte| *byte == 0).filter(|name| !name.is_empty()) {
        let name = std::ffi::OsStr::from_bytes(name);
        let length = rfs::fgetxattr(source, name, &mut value[..])?;
        rfs::fsetxattr(target, name, &value[..length], rfs::XattrFlags::empty())?;
    }
    Ok(())
}

/// Stage beside the target, flush, verify, then rename over it. Returns the new generation.
pub fn write_verified(path: &str, data: &[u8], digest: &str, recovery: &Path) -> std::io::Result<String> {
    let target = fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
    let folder = target.parent().unwrap_or(Path::new("/")).to_path_buf();
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let original = match File::open(&target) {
        Ok(file) => Some(file),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    let metadata = original.as_ref().map(File::metadata).transpose()?;
    let mode = metadata.as_ref().map(|m| m.permissions().mode() & 0o7777);
    // The staged name stays under the 255 bytes a name may have, whatever the target's: its first 100 bytes, whole characters.
    let short: String = name.chars().scan(0, |bytes, c| { *bytes += c.len_utf8(); (*bytes <= 100).then_some(c) }).collect();
    let staged_name = format!(".{short}.{}.rapier-save", crate::random_hex(6));
    let mut staged = folder.join(&staged_name);
    let mut in_place = metadata.as_ref().is_some_and(|m| m.nlink() > 1);
    let mut keep_staged = false;
    let result = (|| {
        let create = |path: &Path, mode| OpenOptions::new().write(true).create_new(true)
            .mode(mode).custom_flags(libc::O_CLOEXEC).open(path);
        let mut file = match create(&staged, mode.unwrap_or(0o666)) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied && original.is_some() => {
                // A writable existing file needs no directory write permission.
                // Keep a durable private copy before the required in-place write.
                fs::DirBuilder::new().recursive(true).mode(0o700).create(recovery)?;
                let info = fs::symlink_metadata(recovery)?;
                if !info.is_dir() || info.uid() != unsafe { libc::geteuid() } || info.mode() & 0o077 != 0 {
                    return Err(std::io::Error::other("the save recovery folder is not private"));
                }
                staged = recovery.join(&staged_name);
                in_place = true;
                create(&staged, 0o600)?
            }
            Err(error) => return Err(error),
        };
        file.write_all(data)?;
        if !in_place {
            if let Some(mode) = mode { file.set_permissions(fs::Permissions::from_mode(mode))?; }
            if let Some(original) = &original { in_place = copy_attributes(original, &file).is_err(); }
        }
        file.sync_all()?;
        drop(file);
        if sha256(&fs::read(&staged)?) != digest {
            return Err(std::io::Error::other(
                "the staged bytes do not match the document",
            ));
        }
        // A file with other hard links is written in place, so every link shows the saved text (a rename would leave
        // the others with the old one). The staged copy, complete and checked, stays beside it until that write is
        // done; if the write fails it is kept and named.
        if in_place {
            fsync_dir(staged.parent().unwrap())?;
            let written = OpenOptions::new().write(true).custom_flags(libc::O_CLOEXEC).open(&target)
                .and_then(|mut file| {
                    let held = file.metadata()?;
                    if !metadata.as_ref().is_some_and(|before| before.dev() == held.dev() && before.ino() == held.ino()) {
                        return Err(std::io::Error::other("the file changed before writing"));
                    }
                    file.write_all(data)?;
                    file.set_len(data.len() as u64)?;
                    file.sync_all()?;
                    let actual = read_snapshot(&target.to_string_lossy())?.0;
                    if sha256(&actual) != digest { return Err(std::io::Error::other("the saved file does not match the document")); }
                    Ok(())
                });
            if let Err(error) = written {
                keep_staged = true;
                return Err(std::io::Error::new(error.kind(), format!("{error}; the saved text is kept in {}", staged.display())));
            }
            fs::remove_file(&staged)?;
            return fsync_dir(staged.parent().unwrap());
        }
        fs::rename(&staged, &target)
    })();
    if let Err(error) = result {
        if !keep_staged {
            let _ = fs::remove_file(&staged);
        }
        return Err(error);
    }
    fsync_dir(&folder)?;
    let (written, generation) = read_snapshot(&target.to_string_lossy())?;
    if sha256(&written) != digest {
        return Err(std::io::Error::other(
            "the saved file does not match the document",
        ));
    }
    Ok(generation)
}

// Unknown, network and user-space filesystems are not admitted (notably NFS O_EXCL); the folder broker's own list.
pub(crate) const LOCAL_FILESYSTEMS: [i64; 5] = [0xEF53, 0x58465342, 0x9123683E, 0x01021994, 0x794C7630];

/// A recovery copy never replaces an existing name, even if it is the original. On failure the new copy is left
/// alone (another actor might now own its name); the editor retains the draft.
pub fn write_new_copy(path: &str, data: &[u8], digest: &str) -> std::io::Result<String> {
    let absolute = normalize(Path::new(path));
    let parent_path = absolute.parent().unwrap_or(Path::new("/"));
    let name = absolute
        .file_name()
        .ok_or_else(|| std::io::Error::other("no file name"))?;
    let parent = rfs::openat2(
        rfs::CWD,
        parent_path,
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::CLOEXEC,
        Mode::empty(),
        ResolveFlags::NO_SYMLINKS | ResolveFlags::NO_MAGICLINKS,
    )?;
    let kind = rfs::fstatfs(&parent)?.f_type as i64;
    if !LOCAL_FILESYSTEMS.contains(&kind) {
        return Err(std::io::Error::other("filesystem_guarantee_unavailable"));
    }
    let fd = rfs::openat(
        &parent,
        name,
        OFlags::RDWR | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
        Mode::from_raw_mode(0o600),
    )
    .map_err(|e| {
        if e == rustix::io::Errno::EXIST {
            std::io::Error::from(std::io::ErrorKind::AlreadyExists)
        } else {
            e.into()
        }
    })?;
    let mut file = File::from(fd);
    file.write_all(data)?;
    file.sync_all()?;
    rfs::fsync(&parent)?;
    let mut actual = vec![0u8; data.len() + 1];
    let read = rustix::io::pread(&file, &mut actual, 0)?;
    actual.truncate(read);
    let held = file.metadata()?;
    let named = rfs::statat(&parent, name, rfs::AtFlags::SYMLINK_NOFOLLOW)?;
    if (held.dev(), held.ino()) != (named.st_dev as u64, named.st_ino as u64)
        || sha256(&actual) != digest
    {
        return Err(std::io::Error::other("copy_changed_during_write"));
    }
    Ok(generation(&held, actual.len(), digest))
}

/// The person's Documents folder: XDG_DOCUMENTS_DIR from ~/.config/user-dirs.dirs, else ~/Documents.
pub fn documents_dir() -> PathBuf {
    let home = crate::home();
    let config = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".config"));
    let named = fs::read_to_string(config.join("user-dirs.dirs"))
        .ok()
        .and_then(|text| {
            text.lines().find_map(|line| {
                let value = line.trim().strip_prefix("XDG_DOCUMENTS_DIR=")?.trim().trim_matches('"');
                let path = match value.strip_prefix("$HOME") {
                    Some(rest) => home.join(rest.trim_start_matches('/')),
                    None => PathBuf::from(value),
                };
                (path.is_absolute() && path != home).then_some(path)
            })
        });
    named.unwrap_or_else(|| home.join("Documents"))
}

/// A folder as a person reads it: under the home folder as ~/...
pub fn shown(folder: &Path) -> String {
    match folder.strip_prefix(crate::home()) {
        Ok(rest) if rest.as_os_str().is_empty() => "~".into(),
        Ok(rest) => format!("~/{}", rest.display()),
        Err(_) => folder.display().to_string(),
    }
}

/// `name` in `folder`, or `stem (2).ext`, `stem (3).ext`, ... when it is taken; never an existing file.
pub fn unused_name(folder: &Path, name: &str) -> PathBuf {
    let name = Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.is_empty() && n != "." && n != "..")
        .unwrap_or_else(|| "document.md".into());
    let first = folder.join(&name);
    if fs::symlink_metadata(&first).is_err() {
        return first;
    }
    let lower = name.to_ascii_lowercase();
    let split = if lower.ends_with(".rapier.html") {
        name.len() - ".rapier.html".len()
    } else {
        name.rfind('.').filter(|&at| at > 0).unwrap_or(name.len())
    };
    let (stem, ext) = name.split_at(split);
    (2..)
        .map(|n| folder.join(format!("{stem} ({n}){ext}")))
        .find(|path| fs::symlink_metadata(path).is_err())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super as files;
    use std::fs;
    use std::io::{self, Read};
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    #[test]
    fn saves_keep_attributes_links_and_writable_files_in_read_only_folders() {
        let root = std::env::temp_dir().join(format!("rapier-save-cell-{}", crate::random_hex(8)));
        fs::create_dir(&root).unwrap();
        let folder = root.join("documents");
        fs::create_dir(&folder).unwrap();
        let recovery = root.join("recovery");
        let path = folder.join("note.md");
        let bytes = b"# Saved\r\n\r\nExact \xf0\x9f\x8c\xb1\r\n";
        fs::write(&path, b"old bytes and a longer tail to remove").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        rustix::fs::setxattr(&path, "user.rapier-test", b"\0metadata\xff", rustix::fs::XattrFlags::empty()).unwrap();
        let check = || {
            assert_eq!(fs::read(&path).unwrap(), bytes);
            let mut value = [0; 32];
            let size = rustix::fs::getxattr(&path, "user.rapier-test", &mut value[..]).unwrap();
            assert_eq!(&value[..size], b"\0metadata\xff");
            assert_eq!(fs::metadata(&path).unwrap().mode() & 0o777, 0o640);
        };
        files::write_verified(path.to_str().unwrap(), bytes, &files::sha256(bytes), &recovery).unwrap();
        check();
        let alias = folder.join("alias.md");
        fs::hard_link(&path, &alias).unwrap();
        let inode = fs::metadata(&path).unwrap().ino();
        fs::write(&path, b"replace this longer text and its trailing bytes").unwrap();
        files::write_verified(path.to_str().unwrap(), bytes, &files::sha256(bytes), &recovery).unwrap();
        check();
        assert_eq!(fs::read(&alias).unwrap(), bytes);
        assert_eq!(fs::metadata(&path).unwrap().ino(), inode);
        fs::remove_file(&alias).unwrap();
        fs::set_permissions(&folder, fs::Permissions::from_mode(0o555)).unwrap();
        fs::write(&path, b"replace this longer text and its trailing bytes").unwrap();
        let saved = files::write_verified(path.to_str().unwrap(), bytes, &files::sha256(bytes), &recovery);
        fs::set_permissions(&folder, fs::Permissions::from_mode(0o755)).unwrap();
        saved.unwrap();
        check();
        assert_eq!(fs::metadata(&path).unwrap().ino(), inode);
        assert!(fs::read_dir(&recovery).unwrap().next().is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn bounded_documents_keep_every_byte_or_refuse() {
        let bytes = b"\xef\xbb\xbfFirst\r\nLast\0\xff";
        assert_eq!(files::read_document(&bytes[..]).unwrap(), bytes);
        let exact = files::read_document(io::repeat(b'x').take(files::MAX_DOCUMENT)).unwrap();
        assert_eq!(exact.len() as u64, files::MAX_DOCUMENT);
        assert!(exact.iter().all(|byte| *byte == b'x'));
        drop(exact);
        let mut oversized = io::repeat(b'x').take(files::MAX_DOCUMENT + 100);
        assert_eq!(files::read_document(&mut oversized).unwrap_err().to_string(), "the file is larger than 64 MiB");
        assert_eq!(oversized.limit(), 99, "only the byte proving overflow is consumed");
    }

    #[test]
    fn failed_read_never_returns_a_prefix() {
        struct Broken;
        impl Read for Broken {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("input interrupted"))
            }
        }
        let input = (&b"prefix"[..]).chain(Broken);
        assert_eq!(files::read_document(input).unwrap_err().to_string(), "input interrupted");
    }
}
