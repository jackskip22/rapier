// SPDX-License-Identifier: AGPL-3.0-only
// Reading, verified saving and exclusive new copies, as linux/rapier does them.
use rustix::fs::{self as rfs, Mode, OFlags, ResolveFlags};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Component, Path, PathBuf};

pub const MAX_DOCUMENT: u64 = 64 * 1024 * 1024;

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
    let mut data = Vec::new();
    file.take(MAX_DOCUMENT + 1).read_to_end(&mut data)?;
    if data.len() as u64 > MAX_DOCUMENT {
        return Err(std::io::Error::other("the file is larger than 64 MiB"));
    }
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

/// Stage beside the target, flush, verify, then rename over it. Returns the new generation.
pub fn write_verified(path: &str, data: &[u8], digest: &str) -> std::io::Result<String> {
    let target = fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
    let folder = target.parent().unwrap_or(Path::new("/")).to_path_buf();
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mode = fs::metadata(&target)
        .ok()
        .map(|m| m.permissions().mode() & 0o7777);
    let staged = folder.join(format!(".{name}.{}.rapier-save", crate::random_hex(6)));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(mode.unwrap_or(0o666))
            .custom_flags(libc::O_CLOEXEC)
            .open(&staged)?;
        file.write_all(data)?;
        file.sync_all()?;
        drop(file);
        if let Some(mode) = mode {
            fs::set_permissions(&staged, fs::Permissions::from_mode(mode))?;
        }
        if sha256(&fs::read(&staged)?) != digest {
            return Err(std::io::Error::other(
                "the staged bytes do not match the document",
            ));
        }
        fs::rename(&staged, &target)
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&staged);
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
const LOCAL_FILESYSTEMS: [i64; 5] = [0xEF53, 0x58465342, 0x9123683E, 0x01021994, 0x794C7630];

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
