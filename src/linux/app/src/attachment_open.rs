// SPDX-License-Identifier: AGPL-3.0-only
// An attachment leaves Notes only as a verified private copy. This owner never sees a Notes path.
use rustix::fs::{self as rfs, AtFlags, Dir, FlockOperation, Mode, OFlags, ResolveFlags};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::path::Path;
use std::time::{Duration, SystemTime};

pub const LIMIT: u64 = 300_000_000;
pub const CHUNK: usize = 128 * 1024;
const TTL: Duration = Duration::from_secs(24 * 60 * 60);
const NO_LINKS: ResolveFlags = ResolveFlags::NO_MAGICLINKS.union(ResolveFlags::NO_SYMLINKS);
const BENEATH: ResolveFlags = NO_LINKS.union(ResolveFlags::BENEATH).union(ResolveFlags::NO_XDEV);
const DIRECTORY: OFlags = OFlags::RDONLY.union(OFlags::DIRECTORY).union(OFlags::CLOEXEC);

fn private(metadata: &fs::Metadata) -> bool {
    metadata.is_dir() && metadata.uid() == unsafe { libc::geteuid() } && metadata.mode() & 0o077 == 0
}

fn private_directory(path: &Path) -> std::io::Result<File> {
    let parent = path.parent().ok_or_else(|| std::io::Error::other("invalid attachment staging folder"))?;
    let name = path.file_name().ok_or_else(|| std::io::Error::other("invalid attachment staging folder"))?;
    let parent = rfs::openat2(rfs::CWD, parent, DIRECTORY, Mode::empty(), NO_LINKS)?;
    match rfs::mkdirat(&parent, name, Mode::from_raw_mode(0o700)) {
        Ok(()) | Err(rustix::io::Errno::EXIST) => (),
        Err(error) => return Err(error.into()),
    }
    let directory = File::from(rfs::openat2(&parent, name, DIRECTORY, Mode::empty(), BENEATH)?);
    if !private(&directory.metadata()?) {
        return Err(std::io::Error::other("the attachment staging folder is not private"));
    }
    Ok(directory)
}

fn same_entry(parent: &File, name: impl rustix::path::Arg, file: &File) -> bool {
    match (rfs::statat(parent, name, AtFlags::SYMLINK_NOFOLLOW), file.metadata()) {
        (Ok(current), Ok(held)) => current.st_dev as u64 == held.dev() && current.st_ino as u64 == held.ino(),
        _ => false,
    }
}

fn clean_expired(root: &File) {
    let Ok(entries) = Dir::read_from(root) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let bytes = name.to_bytes();
        if bytes.len() != 32 || !bytes.iter().all(|c| c.is_ascii_hexdigit()) { continue; }
        let Ok(fd) = rfs::openat2(root, name, DIRECTORY, Mode::empty(), BENEATH) else { continue };
        let directory = File::from(fd);
        // A chooser can outlive the normal cache lifetime. Its live owner keeps this lock until delivery or cancel.
        if rfs::flock(&directory, FlockOperation::NonBlockingLockExclusive).is_err() { continue; }
        let Ok(metadata) = directory.metadata() else { continue };
        if !private(&metadata) || !metadata.modified().ok().and_then(|t| SystemTime::now().duration_since(t).ok())
            .is_some_and(|age| age > TTL) { continue; }
        // Only one ordinary copied file belongs here. Never traverse a child or clean a changed directory shape.
        let Ok(children) = Dir::read_from(&directory) else { continue };
        let children = children.filter(|entry| entry.as_ref().map_or(true,
            |child| !matches!(child.file_name().to_bytes(), b"." | b".."))).take(2).collect::<Result<Vec<_>, _>>();
        let Ok(children) = children else { continue };
        if children.is_empty() {
            if same_entry(root, name, &directory) { let _ = rfs::unlinkat(root, name, AtFlags::REMOVEDIR); }
            continue;
        }
        if children.len() != 1 { continue; }
        let child = children[0].file_name();
        let Ok(fd) = rfs::openat2(&directory, child, OFlags::RDONLY | OFlags::NONBLOCK | OFlags::CLOEXEC,
            Mode::empty(), BENEATH) else { continue };
        let file = File::from(fd);
        let Ok(metadata) = file.metadata() else { continue };
        if !metadata.is_file() || metadata.uid() != unsafe { libc::geteuid() } || metadata.nlink() != 1 ||
            !matches!(metadata.mode() & 0o777, 0o400 | 0o600) || metadata.len() > LIMIT { continue; }
        if same_entry(&directory, child, &file) { let _ = rfs::unlinkat(&directory, child, AtFlags::empty()); }
        if same_entry(root, name, &directory) { let _ = rfs::unlinkat(root, name, AtFlags::REMOVEDIR); }
    }
}

pub struct Pending {
    pub id: String,
    pub generation: String,
    root: File,
    directory: File,
    directory_name: String,
    name: String,
    file: File,
    length: u64,
    digest: String,
    received: u64,
    sequence: u64,
    sealed: bool,
    retained: bool,
    retention_guard: Option<(String, File)>,
}
impl Pending {
    pub fn begin(root: &Path, id: &str, generation: &str, name: &str, length: u64, digest: &str) -> Result<Self, String> {
        if generation.len() != 36 || !generation.bytes().enumerate().all(|(i, c)| {
            if matches!(i, 8 | 13 | 18 | 23) { c == b'-' } else { c.is_ascii_digit() || (b'a'..=b'f').contains(&c) }
        }) || id.is_empty() || id.len() > 160 || name.is_empty() || name.len() > 255 || matches!(name, "." | "..") ||
            name.chars().any(|c| c.is_control() || c == '/' || c == '\\') || length > LIMIT ||
            digest.len() != 64 || !digest.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("invalid attachment transfer".into());
        }
        let root = private_directory(root).map_err(|e| e.to_string())?;
        clean_expired(&root);
        let directory_name = crate::random_hex(16);
        rfs::mkdirat(&root, directory_name.as_str(), Mode::from_raw_mode(0o700)).map_err(|e| e.to_string())?;
        let directory = File::from(rfs::openat2(&root, directory_name.as_str(), DIRECTORY, Mode::empty(), BENEATH)
            .map_err(|e| e.to_string())?);
        rfs::flock(&directory, FlockOperation::NonBlockingLockExclusive).map_err(|e| e.to_string())?;
        let file = match rfs::openat2(&directory, name,
            OFlags::RDWR | OFlags::CREATE | OFlags::EXCL | OFlags::CLOEXEC,
            Mode::from_raw_mode(0o600), BENEATH) {
            Ok(fd) => File::from(fd),
            Err(error) => {
                if same_entry(&root, directory_name.as_str(), &directory) { let _ = rfs::unlinkat(&root, directory_name.as_str(), AtFlags::REMOVEDIR); }
                return Err(error.to_string());
            },
        };
        Ok(Self { id: id.into(), generation: generation.into(), root, directory, directory_name,
            name: name.into(), file, length, digest: digest.to_ascii_lowercase(), received: 0, sequence: 0,
            sealed: false, retained: false, retention_guard: None })
    }
    pub fn append(&mut self, id: &str, sequence: u64, bytes: &[u8]) -> Result<u64, String> {
        if self.sealed || id != self.id || sequence != self.sequence || bytes.is_empty() || bytes.len() > CHUNK ||
            self.received + bytes.len() as u64 > self.length { return Err("invalid attachment chunk".into()); }
        self.file.write_all(bytes).map_err(|e| e.to_string())?;
        self.received += bytes.len() as u64;
        self.sequence += 1;
        Ok(self.received)
    }
    pub fn seal(&mut self) -> Result<File, String> {
        if self.sealed { return Err("attachment transfer is closed".into()); }
        if self.received != self.length { return Err("the attachment transfer is incomplete".into()); }
        let mut verify = || -> std::io::Result<File> {
            self.file.sync_all()?;
            self.file.seek(SeekFrom::Start(0))?;
            let mut hash = Sha256::new();
            let mut buffer = [0u8; CHUNK];
            let mut total = 0u64;
            loop {
                let count = self.file.read(&mut buffer)?;
                if count == 0 { break; }
                total += count as u64;
                if total > self.length { return Err(std::io::Error::other("the attachment changed")); }
                hash.update(&buffer[..count]);
            }
            if total != self.length || format!("{:x}", hash.finalize()) != self.digest {
                return Err(std::io::Error::other("the copied attachment does not match its bytes"));
            }
            let metadata = self.file.metadata()?;
            if !metadata.is_file() || metadata.nlink() != 1 || !same_entry(&self.directory, self.name.as_str(), &self.file) {
                return Err(std::io::Error::other("the attachment changed"));
            }
            self.file.set_permissions(fs::Permissions::from_mode(0o400))?;
            let read = File::from(rfs::openat2(&self.directory, self.name.as_str(), OFlags::RDONLY | OFlags::CLOEXEC,
                Mode::empty(), BENEATH)?);
            let after = read.metadata()?;
            if metadata.dev() != after.dev() || metadata.ino() != after.ino() || after.nlink() != 1 {
                return Err(std::io::Error::other("the attachment changed"));
            }
            Ok(read)
        };
        let read = verify().map_err(|e| e.to_string())?;
        self.file = read.try_clone().map_err(|e| e.to_string())?;
        // Establish the conservative lifetime before the FD can leave this owner. A failed
        // delivery-time timestamp must not make an old copy eligible for immediate cleanup.
        if self.retention_guard.is_none() {
            let name = format!(".retain-{}", crate::random_hex(16));
            let guard = File::from(rfs::openat2(&self.directory, name.as_str(),
                OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::CLOEXEC,
                Mode::from_raw_mode(0o600), BENEATH).map_err(|e| e.to_string())?);
            self.retention_guard = Some((name, guard));
        }
        self.retention_guard.as_ref().unwrap().1.sync_all().map_err(|e| e.to_string())?;
        self.directory.sync_all().map_err(|e| e.to_string())?;
        self.sealed = true;
        Ok(read)
    }
    pub fn retain(&mut self) {
        if self.sealed {
            self.retained = true;
            // Publish the fresh lifetime durably before removing the pre-dispatch guard.
            // On failure its extra entry makes clean_expired preserve this copy indefinitely.
            if self.directory.set_times(fs::FileTimes::new().set_modified(SystemTime::now()))
                .and_then(|_| self.directory.sync_all()).is_ok() {
                self.remove_retention_guard();
            }
        }
    }
    pub fn preserve(&mut self) {
        // A post-dispatch transport failure is not proof of cancellation or refusal.
        // The chooser may still deliver later, so no expiry can safely be inferred here.
        if self.sealed { self.retained = true; }
    }
    fn remove_retention_guard(&self) {
        if let Some((name, guard)) = &self.retention_guard {
            if same_entry(&self.directory, name.as_str(), guard) {
                let _ = rfs::unlinkat(&self.directory, name.as_str(), AtFlags::empty());
            }
        }
    }
}
impl Drop for Pending {
    fn drop(&mut self) {
        if !self.retained {
            self.remove_retention_guard();
            if same_entry(&self.directory, self.name.as_str(), &self.file) {
                let _ = rfs::unlinkat(&self.directory, self.name.as_str(), AtFlags::empty());
            }
            if same_entry(&self.root, self.directory_name.as_str(), &self.directory) {
                let _ = rfs::unlinkat(&self.root, self.directory_name.as_str(), AtFlags::REMOVEDIR);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    fn root() -> PathBuf { let path = std::env::temp_dir().join(format!("rapier-attachment-test-{}", crate::random_hex(8))); private_directory(&path).unwrap(); path }
    #[test]
    fn exact_copy_and_cancel() {
        let root = root(); let bytes = b"<script>window.hostile=1</script>\0\xff";
        let mut pending = Pending::begin(&root, "request", "00000000-0000-4000-8000-000000000001", "雪 & report.html", bytes.len() as u64, &format!("{:x}", Sha256::digest(bytes))).unwrap();
        assert!(pending.append("another", 0, bytes).is_err());
        assert!(pending.append("request", 1, bytes).is_err());
        assert!(pending.seal().is_err());
        pending.append("request", 0, bytes).unwrap();
        assert!(pending.append("request", 0, bytes).is_err());
        let mut file = pending.seal().unwrap(); let mut actual = Vec::new(); file.read_to_end(&mut actual).unwrap(); assert_eq!(actual, bytes);
        assert_eq!(file.metadata().unwrap().mode() & 0o777, 0o400);
        let path = root.join(&pending.directory_name).join(&pending.name); drop(file); drop(pending); assert!(!path.exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn refuses_paths_wrong_digest_and_oversize() {
        let root = root(); let digest = "0".repeat(64);
        for name in ["../escape", "/absolute", "..", "a/b", "a\\b", "bad\nname"] { assert!(Pending::begin(&root, "id", "00000000-0000-4000-8000-000000000001", name, 0, &digest).is_err()); }
        assert!(Pending::begin(&root, "id", "00000000-0000-4000-8000-000000000001", "x", LIMIT + 1, &digest).is_err());
        let mut pending = Pending::begin(&root, "id", "00000000-0000-4000-8000-000000000001", "x", 1, &digest).unwrap(); pending.append("id", 0, b"x").unwrap(); assert!(pending.seal().is_err());
        let path = root.join(&pending.directory_name).join(&pending.name); drop(pending); assert!(!path.exists());
        let outside = root.join("outside"); fs::create_dir(&outside).unwrap(); let link = root.join("link"); std::os::unix::fs::symlink(&outside, &link).unwrap();
        assert!(Pending::begin(&link, "id", "00000000-0000-4000-8000-000000000001", "x", 0, &digest).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn full_attachment_limit_is_streamed_and_retained() {
        let root = root(); let block = vec![0x9d; CHUNK]; let mut hash = Sha256::new();
        for offset in (0..LIMIT).step_by(CHUNK) { hash.update(&block[..((LIMIT-offset) as usize).min(CHUNK)]); }
        let mut pending = Pending::begin(&root, "id", "00000000-0000-4000-8000-000000000001", "full.bin", LIMIT, &format!("{:x}", hash.finalize())).unwrap();
        for (sequence, offset) in (0..LIMIT).step_by(CHUNK).enumerate() { pending.append("id", sequence as u64, &block[..((LIMIT-offset) as usize).min(CHUNK)]).unwrap(); }
        let file = pending.seal().unwrap(); assert_eq!(file.metadata().unwrap().len(), LIMIT);
        pending.retain(); let path = root.join(&pending.directory_name).join(&pending.name); drop(file); drop(pending); assert!(path.is_file());
        clean_expired(&private_directory(&root).unwrap()); assert!(path.is_file()); fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(test)]
mod custody_regressions {
    use super::*;
    use std::path::PathBuf;
    use std::os::unix::fs::DirBuilderExt;
    use std::fs::FileTimes;
    use std::os::unix::fs::symlink;

    fn fixture() -> PathBuf {
        let root = std::env::temp_dir().join(format!("rapier-open-custody-{}", crate::random_hex(8)));
        fs::DirBuilder::new().mode(0o700).create(&root).unwrap();
        root
    }
    fn stage(root: &Path) -> Pending {
        let mut pending = Pending::begin(root, "request", "00000000-0000-4000-8000-000000000001", "report.html", 5, &format!("{:x}", Sha256::digest(b"exact"))).unwrap();
        pending.append("request", 0, b"exact").unwrap();
        pending
    }
    fn staged_path(root: &Path) -> PathBuf {
        let directory = fs::read_dir(root).unwrap().map(|e| e.unwrap().path()).find(|p| p.is_dir()).unwrap();
        directory.join("report.html")
    }

    #[test]
    fn cancel_cannot_follow_a_replaced_stage_directory() {
        let root = fixture(); let outside = fixture();
        let pending = stage(&root); let copied = staged_path(&root);
        let original_directory = copied.parent().unwrap().to_owned();
        let moved = root.join("retained-original");
        fs::rename(&original_directory, &moved).unwrap();
        fs::write(outside.join("report.html"), b"user-owned").unwrap();
        symlink(&outside, &original_directory).unwrap();
        drop(pending);
        assert_eq!(fs::read(outside.join("report.html")).unwrap(), b"user-owned");
        fs::remove_dir_all(root).unwrap(); fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn failed_seal_cannot_delete_a_replacement_file() {
        let root = fixture(); let mut pending = stage(&root); let copied = staged_path(&root);
        fs::rename(&copied, copied.with_file_name("original-kept")).unwrap();
        fs::write(&copied, b"user-owned replacement").unwrap();
        assert!(pending.seal().is_err());
        drop(pending);
        assert_eq!(fs::read(&copied).unwrap(), b"user-owned replacement");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn expiration_does_not_collect_a_live_transfer() {
        let root = fixture(); let mut pending = stage(&root); let copied = staged_path(&root);
        let directory = File::open(copied.parent().unwrap()).unwrap();
        directory.set_times(FileTimes::new().set_modified(SystemTime::now() - TTL - Duration::from_secs(1))).unwrap();
        // Another window/process begins its own request and runs expiration cleanup.
        let other = Pending::begin(&root, "other", "00000000-0000-4000-8000-000000000001", "other.txt", 0, &format!("{:x}", Sha256::digest(b""))).unwrap();
        assert_eq!(fs::read(&copied).unwrap(), b"exact");
        pending.seal().unwrap();
        drop(other); drop(pending); fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn expiration_removes_only_unchanged_owned_shapes() {
        let root = fixture(); let outside = fixture();
        let mut pending = stage(&root);
        let copied = root.join(&pending.directory_name).join(&pending.name);
        pending.seal().unwrap(); pending.retain(); drop(pending);
        let expired = FileTimes::new().set_modified(SystemTime::now() - TTL - Duration::from_secs(1));
        File::open(copied.parent().unwrap()).unwrap().set_times(expired).unwrap();

        let changed = root.join("a".repeat(32));
        fs::DirBuilder::new().mode(0o700).create(&changed).unwrap();
        fs::write(changed.join("original"), b"kept").unwrap();
        fs::write(changed.join("another-file"), b"also kept").unwrap();
        File::open(&changed).unwrap().set_times(expired).unwrap();
        fs::write(outside.join("valuable"), b"not staging").unwrap();
        symlink(&outside, root.join("b".repeat(32))).unwrap();

        // A killed writer can leave one0600 partial; it has no live descriptor lock.
        let partial = root.join("c".repeat(32));
        fs::DirBuilder::new().mode(0o700).create(&partial).unwrap();
        fs::write(partial.join("partial.bin"), b"partial").unwrap();
        fs::set_permissions(partial.join("partial.bin"), fs::Permissions::from_mode(0o600)).unwrap();
        File::open(&partial).unwrap().set_times(expired).unwrap();
        let other = Pending::begin(&root, "other", "00000000-0000-4000-8000-000000000001", "other.txt", 0, &format!("{:x}", Sha256::digest(b""))).unwrap();
        assert!(!copied.exists()); assert!(!partial.exists());
        assert_eq!(fs::read(changed.join("original")).unwrap(), b"kept");
        assert_eq!(fs::read(changed.join("another-file")).unwrap(), b"also kept");
        assert_eq!(fs::read(outside.join("valuable")).unwrap(), b"not staging");
        drop(other); fs::remove_dir_all(root).unwrap(); fs::remove_dir_all(outside).unwrap();
    }
}

#[cfg(test)]
mod retention_regressions {
    use super::*;
    use std::path::PathBuf;

    fn stage() -> (PathBuf, Pending) {
        let root = std::env::temp_dir().join(format!("rapier-retention-test-{}", crate::random_hex(8)));
        let mut pending = Pending::begin(&root, "request", "00000000-0000-4000-8000-000000000001",
            "copy.bin", 1, &format!("{:x}", Sha256::digest(b"x"))).unwrap();
        pending.append("request", 0, b"x").unwrap();
        (root, pending)
    }
    fn path_only_directory(pending: &mut Pending) {
        // A real Linux descriptor permits relative lookup but refuses fsync/futimens.
        // No product failure hook or mocked filesystem is involved.
        pending.directory = File::from(rfs::openat2(&pending.root, pending.directory_name.as_str(),
            OFlags::PATH | OFlags::DIRECTORY | OFlags::CLOEXEC, Mode::empty(), BENEATH).unwrap());
    }
    fn age(pending: &Pending) {
        pending.directory.set_times(fs::FileTimes::new()
            .set_modified(SystemTime::now() - TTL - Duration::from_secs(60))).unwrap();
    }
    #[test]
    fn refuses_handoff_if_guard_cannot_be_durable() {
        let (root, mut pending) = stage();
        let copy = root.join(&pending.directory_name).join(&pending.name);
        path_only_directory(&mut pending);
        assert!(pending.seal().is_err(), "handoff requires the durable guard first");
        drop(pending);
        assert!(!copy.exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn failed_delivery_timestamp_preserves_an_old_copy() {
        let (root, mut pending) = stage();
        let copy = root.join(&pending.directory_name).join(&pending.name);
        pending.seal().unwrap(); age(&pending); path_only_directory(&mut pending);
        pending.retain(); drop(pending);
        clean_expired(&private_directory(&root).unwrap());
        assert_eq!(fs::read(&copy).unwrap(), b"x", "timestamp failure must not shorten delivery lifetime");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn unknown_delivery_has_no_inferred_expiry() {
        let (root, mut pending) = stage();
        let copy = root.join(&pending.directory_name).join(&pending.name);
        pending.seal().unwrap(); age(&pending); pending.preserve(); drop(pending);
        clean_expired(&private_directory(&root).unwrap());
        assert_eq!(fs::read(&copy).unwrap(), b"x");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn confirmed_delivery_expires_after_its_fresh_lifetime() {
        let (root, mut pending) = stage();
        let copy = root.join(&pending.directory_name).join(&pending.name);
        pending.seal().unwrap(); age(&pending); pending.retain();
        assert_eq!(fs::read_dir(copy.parent().unwrap()).unwrap().count(), 1);
        drop(pending);
        clean_expired(&private_directory(&root).unwrap()); assert!(copy.is_file());
        File::open(copy.parent().unwrap()).unwrap().set_times(fs::FileTimes::new()
            .set_modified(SystemTime::now() - TTL - Duration::from_secs(60))).unwrap();
        clean_expired(&private_directory(&root).unwrap()); assert!(!copy.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
