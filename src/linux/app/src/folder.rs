// SPDX-License-Identifier: AGPL-3.0-only
// Linux original-folder broker with checked, same-directory saves, in process.
// Only openat2 beneath one pinned root. No path fallbacks, symlinks, mount crossings or hard-linked files.
// Descriptor pins defeat inode reuse.
use rustix::fd::{AsFd, AsRawFd, OwnedFd};
use rustix::fs::{self as rfs, AtFlags, FileType, Mode, OFlags, ResolveFlags};
use rustix::io::{self as rio, Errno};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};

#[cfg(not(all(
    target_os = "linux",
    any(target_arch = "x86_64", target_arch = "aarch64")
)))]
compile_error!("openat2 witness requires Linux x86_64/aarch64");

pub const MAX_PINS: usize = 256;
pub const MAX_CURSORS: usize = 4;
pub const MAX_ANCHORS: usize = 1024;
pub const MAX_READS: usize = 8;
pub const MAX_WRITES: usize = 4;
pub const MAX_CHUNK: usize = 65536;
pub const MAX_WRITE_CHUNK: usize = 8192;
pub const MAX_WRITE_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_REQUEST: usize = 16384;

const NO_LINKS: ResolveFlags = ResolveFlags::NO_MAGICLINKS.union(ResolveFlags::NO_SYMLINKS);
const BENEATH: ResolveFlags = ResolveFlags::BENEATH
    .union(NO_LINKS)
    .union(ResolveFlags::NO_XDEV);
const LOCAL_FILESYSTEMS: [i64; 5] = [0xEF53, 0x58465342, 0x9123683E, 0x01021994, 0x794C7630];

const LEASE_SLOTS: usize = 64;
const INIT_LEASE_FD: AtomicI32 = AtomicI32::new(-1);
const INIT_LEASE_BROKEN: AtomicBool = AtomicBool::new(false);
static LEASE_FDS: [AtomicI32; LEASE_SLOTS] = [INIT_LEASE_FD; LEASE_SLOTS];
static LEASE_BROKEN: [AtomicBool; LEASE_SLOTS] = [INIT_LEASE_BROKEN; LEASE_SLOTS];

// unsafe: rustix has no wrapper for SIGIO signal handling or fcntl F_SETLEASE/F_UNLCK lease breaking.
extern "C" fn break_reads(_sig: libc::c_int) {
    // A pending open/truncate must never wait for the renderer. Once broken,
    // none of the bytes collected by that read can be admitted.
    for i in 0..LEASE_SLOTS {
        let fd = LEASE_FDS[i].load(Ordering::SeqCst);
        if fd >= 0 {
            LEASE_BROKEN[i].store(true, Ordering::SeqCst);
            unsafe {
                libc::fcntl(fd, libc::F_SETLEASE, libc::F_UNLCK);
            }
        }
    }
}

fn install_sigio_handler() {
    // unsafe: rustix (with feature `fs`) has no sigaction wrapper.
    unsafe {
        let mut sa: libc::sigaction = std::mem::zeroed();
        sa.sa_sigaction = break_reads as *const () as usize;
        sa.sa_flags = libc::SA_RESTART;
        libc::sigemptyset(&mut sa.sa_mask);
        libc::sigaction(libc::SIGIO, &sa, std::ptr::null_mut());
    }
}

fn acquire_lease_slot(raw_fd: i32) -> Option<usize> {
    for i in 0..LEASE_SLOTS {
        if LEASE_FDS[i]
            .compare_exchange(-1, raw_fd, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            LEASE_BROKEN[i].store(false, Ordering::SeqCst);
            return Some(i);
        }
    }
    None
}

fn release_lease_slot(slot: usize) {
    if slot < LEASE_SLOTS {
        LEASE_FDS[slot].store(-1, Ordering::SeqCst);
        LEASE_BROKEN[slot].store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Error {
    Refusal(&'static str),
    Os(i32),
    Unicode,
}

impl Error {
    fn into_code(self) -> String {
        match self {
            Error::Refusal(code) => code.to_string(),
            Error::Os(errno) => errno_code(errno).to_string(),
            Error::Unicode => "invalid_name".to_string(),
        }
    }
}

impl From<Errno> for Error {
    fn from(err: Errno) -> Self {
        Error::Os(err.raw_os_error())
    }
}

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::Os(err.raw_os_error().unwrap_or(0))
    }
}

fn errno_code(errno: i32) -> &'static str {
    match errno {
        libc::ENOENT => "missing",
        libc::EACCES | libc::EPERM => "unavailable",
        libc::ENOTDIR => "stale_locator",
        libc::ELOOP => "symlink_refused",
        libc::EXDEV => "escape_refused",
        libc::EAGAIN => "resolution_race",
        libc::ENOSYS => "openat2_unavailable",
        _ => "unavailable",
    }
}

fn openat2<Fd: AsFd, P: rustix::path::Arg>(
    parent: Fd,
    path: P,
    flags: OFlags,
    resolve: ResolveFlags,
) -> Result<OwnedFd, Error> {
    rfs::openat2(
        parent,
        path,
        flags | OFlags::CLOEXEC,
        Mode::empty(),
        resolve,
    )
    .map_err(Error::from)
}

fn identity(s: &rfs::Stat) -> (u64, u64) {
    (s.st_dev as u64, s.st_ino as u64)
}

fn require_local_filesystem<Fd: AsFd>(fd: Fd) -> Result<(), Error> {
    // Linux 64-bit statfs begins with a long f_type. Unknown, network and user-space
    // filesystems are not admitted by this local-kernel contract (notably NFS O_EXCL).
    match rfs::fstatfs(fd) {
        Ok(info) if LOCAL_FILESYSTEMS.contains(&(info.f_type as i64)) => Ok(()),
        _ => Err(Error::Refusal("filesystem_guarantee_unavailable")),
    }
}

fn version(s: &rfs::Stat) -> String {
    let mtime_ns = s.st_mtime as i128 * 1_000_000_000 + s.st_mtime_nsec as i128;
    let ctime_ns = s.st_ctime as i128 * 1_000_000_000 + s.st_ctime_nsec as i128;
    format!(
        "{}:{}:{}:{}:{}:{}",
        s.st_dev, s.st_ino, s.st_size, mtime_ns, ctime_ns, s.st_nlink
    )
}

fn pathcheck(path: &str) -> Result<&str, Error> {
    if path.len() > 8192 {
        return Err(Error::Refusal("invalid_path"));
    }
    if path.is_empty() {
        return Ok(".");
    }
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() > 64
        || parts.iter().any(|p| {
            p.is_empty()
                || *p == "."
                || *p == ".."
                || p.contains('\\')
                || p.contains('\0')
                || p.len() > 255
        })
    {
        return Err(Error::Refusal("invalid_path"));
    }
    Ok(path)
}

fn abspath(path: &Path) -> PathBuf {
    let joined = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("/"))
            .join(path)
    };
    let mut out = PathBuf::from("/");
    for component in joined.components() {
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

fn split_parent_components(path: &str) -> Vec<&str> {
    if path.is_empty() {
        return Vec::new();
    }
    let mut parts: Vec<&str> = path.split('/').collect();
    parts.pop();
    parts
}

fn leaf_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or("")
}

fn splitext(name: &str) -> (&str, &str) {
    let Some(first_non_dot) = name.find(|c| c != '.') else {
        return (name, "");
    };
    match name.rfind('.') {
        Some(dot) if dot > first_non_dot => (&name[..dot], &name[dot..]),
        _ => (name, ""),
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn random_hex(bytes: usize) -> Result<String, Error> {
    let mut buffer = vec![0u8; bytes];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut buffer)?;
    Ok(hex_encode(&buffer))
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn b64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3f) as usize]);
        out.push(TABLE[((triple >> 12) & 0x3f) as usize]);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3f) as usize]
        } else {
            b'='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3f) as usize]
        } else {
            b'='
        });
    }
    String::from_utf8(out).unwrap_or_default()
}

fn b64_decode_strict(text: &str) -> Result<Vec<u8>, Error> {
    let bytes = text.as_bytes();
    if bytes.len() % 4 != 0 {
        return Err(Error::Os(0));
    }
    let val = |b: u8| -> Option<u32> {
        match b {
            b'A'..=b'Z' => Some((b - b'A') as u32),
            b'a'..=b'z' => Some((b - b'a' + 26) as u32),
            b'0'..=b'9' => Some((b - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    };
    let mut out = Vec::with_capacity((bytes.len() / 4) * 3);
    let chunks = bytes.chunks_exact(4);
    let total_chunks = chunks.len();
    for (i, quad) in chunks.enumerate() {
        let last = i + 1 == total_chunks;
        let c0 = val(quad[0]).ok_or(Error::Os(0))?;
        let c1 = val(quad[1]).ok_or(Error::Os(0))?;
        match (quad[2], quad[3]) {
            (b'=', b'=') if last => {
                let triple = (c0 << 18) | (c1 << 12);
                out.push(((triple >> 16) & 0xff) as u8);
            }
            (b'=', _) => return Err(Error::Os(0)),
            (q2, b'=') if last => {
                let c2 = val(q2).ok_or(Error::Os(0))?;
                let triple = (c0 << 18) | (c1 << 12) | (c2 << 6);
                out.push(((triple >> 16) & 0xff) as u8);
                out.push(((triple >> 8) & 0xff) as u8);
            }
            (_, b'=') => return Err(Error::Os(0)),
            (q2, q3) => {
                let c2 = val(q2).ok_or(Error::Os(0))?;
                let c3 = val(q3).ok_or(Error::Os(0))?;
                let triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
                out.push(((triple >> 16) & 0xff) as u8);
                out.push(((triple >> 8) & 0xff) as u8);
                out.push((triple & 0xff) as u8);
            }
        }
    }
    Ok(out)
}

fn platform_string() -> String {
    let release = std::fs::read_to_string("/proc/sys/kernel/osrelease")
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    if release.is_empty() {
        format!("Linux-{}", std::env::consts::ARCH)
    } else {
        format!("Linux-{release}-{}", std::env::consts::ARCH)
    }
}

#[derive(Clone)]
struct Pin {
    key: String,
    path: String,
    fd: Rc<OwnedFd>,
    parents: Vec<Rc<OwnedFd>>,
}

struct ReadState {
    fd: Rc<OwnedFd>,
    pin: Pin,
    slot: usize,
    broken: bool,
    version: String,
}

struct CursorState {
    path: String,
    fd: Rc<OwnedFd>,
    it: rfs::Dir,
    version: String,
}

#[derive(Clone)]
struct Expected {
    size: i64,
    version: String,
    digest: String,
}

struct WriteState {
    pin: Pin,
    parent: Rc<OwnedFd>,
    stage: Option<String>,
    fd: Rc<OwnedFd>,
    size: u64,
    offset: u64,
    expected: Expected,
    digest: String,
}

#[derive(Default)]
struct Metrics {
    metadata: u64,
    entries: u64,
    body_reads: u64,
    body_bytes: u64,
    writes: u64,
    pins_peak: usize,
    cursors_peak: usize,
    chunk_peak: usize,
}

pub struct Broker {
    root_path: PathBuf,
    root_fd: Rc<OwnedFd>,
    root_identity: (u64, u64),
    pins: HashMap<String, Pin>,
    cursors: HashMap<String, CursorState>,
    reads: HashMap<String, ReadState>,
    writes: HashMap<String, WriteState>,
    anchors: usize,
    serial: u64,
    metrics: Metrics,
    root: Value,
}

impl Broker {
    pub fn open<P: AsRef<Path>>(root: P) -> Result<Broker, String> {
        Self::open_inner(root.as_ref()).map_err(Error::into_code)
    }

    fn open_inner(root: &Path) -> Result<Broker, Error> {
        if OFlags::PATH.bits() == 0 {
            return Err(Error::Refusal("openat2_unavailable"));
        }
        let root_path = abspath(root);
        let root_fd = openat2(
            rfs::CWD,
            &root_path,
            OFlags::PATH | OFlags::DIRECTORY,
            NO_LINKS,
        )?;
        require_local_filesystem(&root_fd)?;
        let root_identity = identity(&rfs::fstat(&root_fd).map_err(Error::from)?);
        let dup_root = rio::fcntl_dupfd_cloexec(&root_fd, 0).map_err(Error::from)?;
        let mut broker = Broker {
            root_path: root_path.clone(),
            root_fd: Rc::new(root_fd),
            root_identity,
            pins: HashMap::new(),
            cursors: HashMap::new(),
            reads: HashMap::new(),
            writes: HashMap::new(),
            anchors: 0,
            serial: 0,
            metrics: Metrics::default(),
            root: Value::Null,
        };
        let mut root_row = broker.pin("", dup_root)?;
        let root_name = root_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "/".to_string());
        root_row["name"] = json!(root_name);
        broker.root = root_row;
        install_sigio_handler();
        Ok(broker)
    }

    fn new_id(&mut self) -> String {
        self.serial += 1;
        self.serial.to_string()
    }

    fn check_root(&self) -> Result<(), Error> {
        // Display-path replacement invalidates the binding, but never drives
        // descendant access: all opens below use the original root descriptor.
        let fd = openat2(
            rfs::CWD,
            &self.root_path,
            OFlags::PATH | OFlags::DIRECTORY,
            NO_LINKS,
        )?;
        let s = rfs::fstat(&fd).map_err(Error::from)?;
        if identity(&s) != self.root_identity {
            return Err(Error::Refusal("stale_root"));
        }
        Ok(())
    }

    fn stat<Fd: AsFd>(&mut self, fd: Fd) -> Result<rfs::Stat, Error> {
        self.metrics.metadata += 1;
        rfs::fstat(fd).map_err(Error::from)
    }

    fn pin(&mut self, path: &str, fd: OwnedFd) -> Result<Value, Error> {
        if self.pins.len() >= MAX_PINS {
            return Err(Error::Refusal("pin_limit"));
        }
        let s = self.stat(&fd)?;
        let file_type = FileType::from_raw_mode(s.st_mode);
        let kind = if file_type.is_dir() {
            "directory"
        } else if file_type.is_file() {
            if s.st_nlink as u64 != 1 {
                return Err(Error::Refusal("hardlink_refused"));
            }
            "file"
        } else {
            return Err(Error::Refusal("unsupported_entry"));
        };
        let components = split_parent_components(path);
        if self.anchors + components.len() > MAX_ANCHORS {
            return Err(Error::Refusal("pin_limit"));
        }
        let mut parents: Vec<Rc<OwnedFd>> = Vec::with_capacity(components.len());
        for name in &components {
            let parent_fd: &OwnedFd = parents.last().map(|p| p.as_ref()).unwrap_or(&self.root_fd);
            let next = openat2(parent_fd, *name, OFlags::PATH | OFlags::DIRECTORY, BENEATH)?;
            parents.push(Rc::new(next));
        }
        if !path.is_empty() {
            let parent_fd: &OwnedFd = parents.last().map(|p| p.as_ref()).unwrap_or(&self.root_fd);
            let current = openat2(parent_fd, leaf_name(path), OFlags::PATH, BENEATH)?;
            let current_stat = self.stat(&current)?;
            drop(current);
            if identity(&current_stat) != identity(&s) {
                return Err(Error::Refusal("stale_locator"));
            }
        }
        let key = self.new_id();
        self.anchors += parents.len();
        self.pins.insert(
            key.clone(),
            Pin {
                key: key.clone(),
                path: path.to_string(),
                fd: Rc::new(fd),
                parents,
            },
        );
        self.metrics.pins_peak = self.metrics.pins_peak.max(self.pins.len());
        Ok(json!({
            "id": key,
            "name": leaf_name(path),
            "displayPath": path,
            "kind": kind,
            "size": s.st_size,
            "version": version(&s),
        }))
    }

    fn get(&self, key: Option<&str>) -> Result<Pin, Error> {
        let Some(k) = key else {
            return Err(Error::Refusal("stale_locator"));
        };
        self.pins
            .get(k)
            .cloned()
            .ok_or(Error::Refusal("stale_locator"))
    }

    fn checked_parent(&mut self, pin: &Pin) -> Result<Rc<OwnedFd>, Error> {
        self.check_root()?;
        let mut parent = Rc::clone(&self.root_fd);
        for (name, held) in split_parent_components(&pin.path)
            .into_iter()
            .zip(pin.parents.iter())
        {
            let current = openat2(&*parent, name, OFlags::PATH | OFlags::DIRECTORY, BENEATH)?;
            let current_stat = self.stat(&current)?;
            drop(current);
            let held_stat = self.stat(&**held)?;
            if identity(&current_stat) != identity(&held_stat) {
                return Err(Error::Refusal("stale_locator"));
            }
            parent = Rc::clone(held);
        }
        Ok(parent)
    }

    fn checked_fd(&mut self, pin: &Pin, flags: OFlags) -> Result<OwnedFd, Error> {
        let parent = self.checked_parent(pin)?;
        let target = if pin.path.is_empty() {
            "."
        } else {
            leaf_name(&pin.path)
        };
        let fd = openat2(&*parent, target, flags, BENEATH)?;
        let actual = self.stat(&fd)?;
        let expected = self.stat(&*pin.fd)?;
        if identity(&actual) != identity(&expected) {
            return Err(Error::Refusal("stale_locator"));
        }
        if FileType::from_raw_mode(actual.st_mode).is_file() && actual.st_nlink as u64 != 1 {
            return Err(Error::Refusal("hardlink_refused"));
        }
        Ok(fd)
    }

    fn checked_cursor_fd(
        &mut self,
        path: &str,
        anchor: &OwnedFd,
        flags: OFlags,
    ) -> Result<OwnedFd, Error> {
        self.check_root()?;
        let checked = pathcheck(path)?;
        let fd = openat2(&*self.root_fd, checked, flags, BENEATH)?;
        let actual = self.stat(&fd)?;
        let expected = self.stat(anchor)?;
        if identity(&actual) != identity(&expected) {
            return Err(Error::Refusal("stale_locator"));
        }
        if FileType::from_raw_mode(actual.st_mode).is_file() && actual.st_nlink as u64 != 1 {
            return Err(Error::Refusal("hardlink_refused"));
        }
        Ok(fd)
    }

    fn validate(&mut self, key: Option<&str>) -> Result<Value, Error> {
        let pin = self.get(key)?;
        let fd = self.checked_fd(&pin, OFlags::PATH)?;
        let s = self.stat(&fd)?;
        Ok(json!({ "size": s.st_size, "version": version(&s) }))
    }

    fn lookup(&mut self, path: &str) -> Result<Value, Error> {
        self.check_root()?;
        let checked = pathcheck(path)?;
        let fd = openat2(&*self.root_fd, checked, OFlags::PATH, BENEATH)?;
        self.pin(path, fd)
    }

    fn relative(&mut self, key: Option<&str>, path: &str) -> Result<Value, Error> {
        let source = self.get(key)?;
        drop(self.checked_fd(&source, OFlags::PATH)?);
        let checked = pathcheck(path)?;
        let parts: Vec<&str> = checked.split('/').collect();
        let origin = split_parent_components(&source.path);
        let mut common = 0;
        while common < origin.len().min(parts.len().saturating_sub(1))
            && origin[common] == parts[common]
        {
            common += 1;
        }
        let parent: &OwnedFd = if common > 0 {
            &source.parents[common - 1]
        } else {
            &self.root_fd
        };
        let subpath = parts[common..].join("/");
        let fd = openat2(parent, &subpath, OFlags::PATH, BENEATH)?;
        let row = self.pin(path, fd)?;
        let row_id = row["id"].as_str().unwrap_or("").to_string();
        let check_ancestry = (|| -> Result<(), Error> {
            // The source's parent and the new row's common ancestry must be the
            // same descriptors' objects, even if the file was moved between them.
            let target = self.get(Some(&row_id))?;
            for (a, b) in source.parents[..common]
                .iter()
                .zip(target.parents[..common].iter())
            {
                let sa = self.stat(&**a)?;
                let sb = self.stat(&**b)?;
                if identity(&sa) != identity(&sb) {
                    return Err(Error::Refusal("stale_locator"));
                }
            }
            drop(self.checked_fd(&source, OFlags::PATH)?);
            Ok(())
        })();
        if let Err(err) = check_ancestry {
            self.release(Some(&row_id));
            return Err(err);
        }
        Ok(row)
    }

    fn retain(&mut self, key: Option<&str>) -> Result<Value, Error> {
        let pin = self.get(key)?;
        let fd = self.checked_fd(&pin, OFlags::PATH)?;
        self.pin(&pin.path, fd)
    }

    fn retain_for_save(&mut self, key: Option<&str>) -> Result<Value, Error> {
        let pin = self.get(key)?;
        self.checked_parent(&pin)?;
        if self.pins.len() >= MAX_PINS || self.anchors + pin.parents.len() > MAX_ANCHORS {
            return Err(Error::Refusal("pin_limit"));
        }
        let dup_fd = rio::fcntl_dupfd_cloexec(&*pin.fd, 0).map_err(Error::from)?;
        let mut dup_parents = Vec::with_capacity(pin.parents.len());
        for parent in &pin.parents {
            dup_parents.push(Rc::new(
                rio::fcntl_dupfd_cloexec(&**parent, 0).map_err(Error::from)?,
            ));
        }
        let new_key = self.new_id();
        let owned_fd = Rc::new(dup_fd);
        self.anchors += dup_parents.len();
        self.pins.insert(
            new_key.clone(),
            Pin {
                key: new_key.clone(),
                path: pin.path.clone(),
                fd: Rc::clone(&owned_fd),
                parents: dup_parents,
            },
        );
        let s = self.stat(&*owned_fd)?;
        Ok(json!({
            "id": new_key,
            "name": leaf_name(&pin.path),
            "displayPath": pin.path,
            "kind": "file",
            "size": s.st_size,
            "version": version(&s),
        }))
    }

    fn release(&mut self, key: Option<&str>) -> bool {
        if let Some(k) = key {
            if let Some(pin) = self.pins.remove(k) {
                self.anchors -= pin.parents.len();
            }
        }
        true
    }

    fn read_start(&mut self, key: Option<&str>) -> Result<Value, Error> {
        if self.reads.len() >= MAX_READS {
            return Err(Error::Refusal("read_limit"));
        }
        let pin = self.get(key)?;
        let fd = self.checked_fd(&pin, OFlags::RDONLY | OFlags::NONBLOCK)?;
        let before = self.stat(&fd)?;
        if !FileType::from_raw_mode(before.st_mode).is_file() {
            return Err(Error::Refusal("not_file"));
        }
        let token = self.new_id();
        let ver = version(&before);
        let slot = acquire_lease_slot(fd.as_raw_fd()).ok_or(Error::Refusal("read_limit"))?;
        // unsafe: rustix has no wrapper for fcntl F_SETLEASE.
        let rc = unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_SETLEASE, libc::F_RDLCK) };
        if rc < 0 {
            let errno = std::io::Error::last_os_error().raw_os_error().unwrap_or(0);
            release_lease_slot(slot);
            return Err(Error::Refusal(if errno == libc::EAGAIN {
                "changed_during_read"
            } else {
                "coherent_snapshot_unavailable"
            }));
        }
        self.reads.insert(
            token.clone(),
            ReadState {
                fd: Rc::new(fd),
                pin,
                slot,
                broken: false,
                version: ver.clone(),
            },
        );
        Ok(json!({
            "read": token,
            "size": before.st_size,
            "version": ver,
        }))
    }

    fn read_close(&mut self, token: Option<&str>) -> bool {
        if let Some(t) = token {
            if let Some(read) = self.reads.remove(t) {
                release_lease_slot(read.slot);
            }
        }
        true
    }

    fn check_read_current(&mut self, token: &str) -> Result<(Rc<OwnedFd>, String), Error> {
        let (fd, pin, slot, mut broken, ver) = {
            let read = self.reads.get(token).ok_or(Error::Refusal("stale_read"))?;
            (
                Rc::clone(&read.fd),
                read.pin.clone(),
                read.slot,
                read.broken,
                read.version.clone(),
            )
        };
        if !broken && LEASE_BROKEN[slot].load(Ordering::SeqCst) {
            broken = true;
            if let Some(read) = self.reads.get_mut(token) {
                read.broken = true;
            }
        }
        // unsafe: rustix has no wrapper for fcntl F_GETLEASE.
        let lease = unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_GETLEASE) };
        if broken || lease != libc::F_RDLCK {
            return Err(Error::Refusal("changed_during_read"));
        }
        let s = self.stat(&*fd)?;
        if version(&s) != ver {
            return Err(Error::Refusal("changed_during_read"));
        }
        drop(self.checked_fd(&pin, OFlags::PATH)?);
        Ok((fd, ver))
    }

    fn read_chunk(
        &mut self,
        token: Option<&str>,
        offset: &Value,
        length: &Value,
    ) -> Result<Value, Error> {
        let Some(token) = token.filter(|t| self.reads.contains_key(*t)) else {
            return Err(Error::Refusal("stale_read"));
        };
        let Some(offset) = offset.as_i64().filter(|&o| o >= 0) else {
            return Err(Error::Refusal("invalid_range"));
        };
        let Some(length) = length
            .as_i64()
            .filter(|&l| (0..=MAX_CHUNK as i64).contains(&l))
        else {
            return Err(Error::Refusal("invalid_range"));
        };
        let (fd, ver) = self.check_read_current(token)?;
        let mut data = vec![0u8; length as usize];
        let n = rio::pread(&*fd, &mut data, offset as u64).map_err(Error::from)?;
        data.truncate(n);
        self.check_read_current(token)?;
        self.metrics.body_reads += 1;
        self.metrics.body_bytes += data.len() as u64;
        self.metrics.chunk_peak = self.metrics.chunk_peak.max(data.len());
        Ok(json!({
            "data": b64_encode(&data),
            "version": ver,
        }))
    }

    fn list_start(&mut self, key: Option<&str>) -> Result<Value, Error> {
        if self.cursors.len() >= MAX_CURSORS {
            return Err(Error::Refusal("cursor_limit"));
        }
        let pin = self.get(key)?;
        let fd = self.checked_fd(&pin, OFlags::RDONLY | OFlags::DIRECTORY)?;
        let it = rfs::Dir::read_from(&fd).map_err(Error::from)?;
        let ver = version(&self.stat(&fd)?);
        let cursor = self.new_id();
        self.cursors.insert(
            cursor.clone(),
            CursorState {
                path: pin.path,
                fd: Rc::new(fd),
                it,
                version: ver,
            },
        );
        self.metrics.cursors_peak = self.metrics.cursors_peak.max(self.cursors.len());
        Ok(json!(cursor))
    }

    fn list_close(&mut self, cursor: Option<&str>) -> bool {
        if let Some(c) = cursor {
            self.cursors.remove(c);
        }
        true
    }

    fn check_cursor_current(
        &mut self,
        path: &str,
        anchor: &OwnedFd,
        expected_version: &str,
    ) -> Result<(), Error> {
        let fd = self.checked_cursor_fd(path, anchor, OFlags::RDONLY | OFlags::DIRECTORY)?;
        let s = self.stat(&fd)?;
        if version(&s) != expected_version {
            return Err(Error::Refusal("listing_changed"));
        }
        Ok(())
    }

    fn list_next(&mut self, cursor: Option<&str>, limit: &Value) -> Result<Value, Error> {
        let Some(limit) = limit.as_i64().filter(|&l| (1..=128).contains(&l)) else {
            return Err(Error::Refusal("invalid_limit"));
        };
        let Some(cursor_id) = cursor.filter(|c| self.cursors.contains_key(*c)) else {
            return Err(Error::Refusal("stale_cursor"));
        };
        let (pin_path, pin_fd, expected_version) = {
            let state = self.cursors.get(cursor_id).unwrap();
            (
                state.path.clone(),
                Rc::clone(&state.fd),
                state.version.clone(),
            )
        };
        let mut entries: Vec<Value> = Vec::new();
        let mut skipped: u64 = 0;
        let result = (|| -> Result<(bool, u64), Error> {
            self.check_cursor_current(&pin_path, &pin_fd, &expected_version)?;
            let mut done = false;
            for _ in 0..limit {
                let next_item = {
                    let state = self
                        .cursors
                        .get_mut(cursor_id)
                        .ok_or(Error::Refusal("stale_cursor"))?;
                    loop {
                        match state.it.next() {
                            Some(Ok(e))
                                if e.file_name().to_bytes() == b"."
                                    || e.file_name().to_bytes() == b".." =>
                            {
                                continue;
                            }
                            Some(Ok(e)) => {
                                break Some(Ok((e.file_name().to_bytes().to_vec(), e.ino())));
                            }
                            Some(Err(err)) => break Some(Err(Error::from(err))),
                            None => break None,
                        }
                    }
                };
                let Some(next_item) = next_item else {
                    done = true;
                    break;
                };
                let (raw_name, ino) = next_item?;
                // Count an unadmitted entry without hiding its safe siblings.
                // Invalid names are never converted into lossy display aliases.
                let row_res = match std::str::from_utf8(&raw_name) {
                    Ok(name) => {
                        let path = match (pin_path.is_empty(), name.is_empty()) {
                            (true, _) => name.to_string(),
                            (false, true) => pin_path.clone(),
                            (false, false) => format!("{pin_path}/{name}"),
                        };
                        self.lookup(&path)
                    }
                    Err(_) => Err(Error::Unicode),
                };
                let row = match row_res {
                    Ok(row) => row,
                    Err(error) => {
                        if !matches!(
                            error,
                            Error::Unicode
                                | Error::Os(libc::ELOOP)
                                | Error::Refusal(
                                    "unsupported_entry" | "hardlink_refused" | "invalid_path"
                                )
                        ) {
                            return Err(error);
                        }
                        skipped += 1;
                        continue;
                    }
                };
                let row_id = row["id"].as_str().unwrap_or("").to_string();
                entries.push(row);
                let pinned = self.get(Some(&row_id))?;
                let pinned_stat = self.stat(&*pinned.fd)?;
                if pinned_stat.st_ino as u64 != ino {
                    return Err(Error::Refusal("listing_changed"));
                }
                self.metrics.entries += 1;
            }
            self.check_cursor_current(&pin_path, &pin_fd, &expected_version)?;
            if done {
                self.list_close(Some(cursor_id));
            }
            Ok((done, skipped))
        })();
        match result {
            Ok((done, skipped)) => Ok(json!({
                "entries": entries,
                "done": done,
                "skipped": skipped,
            })),
            Err(err) => {
                for row in &entries {
                    self.release(row["id"].as_str());
                }
                self.list_close(Some(cursor_id));
                Err(err)
            }
        }
    }

    fn write_start(
        &mut self,
        key: Option<&str>,
        size: &Value,
        expected: &Value,
        digest: &Value,
    ) -> Result<Value, Error> {
        let Some(size) = size
            .as_i64()
            .filter(|&s| (0..=MAX_WRITE_BYTES as i64).contains(&s))
        else {
            return Err(Error::Refusal("write_limit"));
        };
        let size = size as u64;
        if self.writes.len() >= MAX_WRITES {
            return Err(Error::Refusal("write_limit"));
        }
        let reserved: u64 = self.writes.values().map(|w| w.size).sum();
        if reserved + size > MAX_WRITE_BYTES {
            return Err(Error::Refusal("write_limit"));
        }
        let Some(digest) = digest.as_str().filter(|d| is_hex64(d)) else {
            return Err(Error::Refusal("invalid_snapshot"));
        };
        let Some(expected_obj) = expected.as_object() else {
            return Err(Error::Refusal("invalid_snapshot"));
        };
        let Some(exp_size) = expected_obj.get("size").and_then(Value::as_i64) else {
            return Err(Error::Refusal("invalid_snapshot"));
        };
        let Some(exp_ver) = expected_obj
            .get("version")
            .and_then(Value::as_str)
            .filter(|v| v.chars().count() <= 256)
        else {
            return Err(Error::Refusal("invalid_snapshot"));
        };
        let Some(exp_digest) = expected_obj
            .get("digest")
            .and_then(Value::as_str)
            .filter(|d| is_hex64(d))
        else {
            return Err(Error::Refusal("invalid_snapshot"));
        };
        let pin = self.get(key)?;
        let parent_anchor = self.checked_parent(&pin)?;
        let parent = openat2(
            &*parent_anchor,
            ".",
            OFlags::RDONLY | OFlags::DIRECTORY,
            BENEATH,
        )?;
        let name = format!(".rapier-save-{}.tmp", random_hex(16)?);
        let fd = rfs::openat(
            &parent,
            &name,
            OFlags::RDWR | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::from_raw_mode(0o600),
        )
        .map_err(Error::from)?;
        let token = self.new_id();
        self.writes.insert(
            token.clone(),
            WriteState {
                pin,
                parent: Rc::new(parent),
                stage: Some(name),
                fd: Rc::new(fd),
                size,
                offset: 0,
                expected: Expected {
                    size: exp_size,
                    version: exp_ver.to_string(),
                    digest: exp_digest.to_string(),
                },
                digest: digest.to_string(),
            },
        );
        Ok(json!(token))
    }

    fn write_chunk(
        &mut self,
        token: Option<&str>,
        offset: &Value,
        data: &Value,
    ) -> Result<Value, Error> {
        let Some(token) = token.filter(|t| self.writes.contains_key(*t)) else {
            return Err(Error::Refusal("stale_write"));
        };
        let data_str = data.as_str().ok_or(Error::Os(0))?;
        let chunk = b64_decode_strict(data_str)?;
        let w = self
            .writes
            .get_mut(token)
            .ok_or(Error::Refusal("stale_write"))?;
        let Some(off) = offset.as_i64().filter(|&o| o >= 0 && o as u64 == w.offset) else {
            return Err(Error::Refusal("invalid_range"));
        };
        let _ = off;
        if chunk.is_empty()
            || chunk.len() > MAX_WRITE_CHUNK
            || w.offset + chunk.len() as u64 > w.size
        {
            return Err(Error::Refusal("invalid_range"));
        }
        let mut at = 0;
        while at < chunk.len() {
            let n = rio::write(&*w.fd, &chunk[at..]).map_err(Error::from)?;
            if n == 0 {
                return Err(Error::Refusal("write_incomplete"));
            }
            at += n;
        }
        w.offset += chunk.len() as u64;
        Ok(json!(w.offset))
    }

    fn write_close(&mut self, token: Option<&str>) -> Result<Value, Error> {
        let Some(t) = token else {
            return Ok(json!(true));
        };
        if let Some(w) = self.writes.remove(t) {
            if let Some(stage) = &w.stage {
                match rfs::statat(&*w.parent, stage, AtFlags::SYMLINK_NOFOLLOW) {
                    Ok(stage_stat) => {
                        let fd_stat = self.stat(&*w.fd)?;
                        if identity(&stage_stat) == identity(&fd_stat) {
                            match rfs::unlinkat(&*w.parent, stage, AtFlags::empty()) {
                                Ok(()) | Err(Errno::NOENT) => {}
                                Err(err) => return Err(Error::from(err)),
                            }
                        }
                    }
                    Err(Errno::NOENT) => {}
                    Err(err) => return Err(Error::from(err)),
                }
            }
        }
        Ok(json!(true))
    }

    fn digest_fd<Fd: AsFd>(fd: Fd, size: u64) -> Result<String, Error> {
        let mut digest = Sha256::new();
        let mut buf = vec![0u8; MAX_CHUNK];
        let mut at = 0u64;
        while at < size {
            let want = (MAX_CHUNK as u64).min(size - at) as usize;
            let n = rio::pread(&fd, &mut buf[..want], at).map_err(Error::from)?;
            if n != want {
                return Err(Error::Refusal("changed_during_read"));
            }
            digest.update(&buf[..n]);
            at += want as u64;
        }
        Ok(hex_encode(&digest.finalize()))
    }

    fn verify_stage(
        &mut self,
        parent: &OwnedFd,
        stage: &str,
        w_fd: &OwnedFd,
        w_size: u64,
        intended: &str,
    ) -> Result<(), Error> {
        let current = rfs::statat(parent, stage, AtFlags::SYMLINK_NOFOLLOW).map_err(Error::from)?;
        let fd_stat = self.stat(w_fd)?;
        if identity(&current) != identity(&fd_stat)
            || current.st_size as u64 != w_size
            || Self::digest_fd(w_fd, w_size)? != intended
        {
            return Err(Error::Refusal("stage_changed"));
        }
        Ok(())
    }

    fn write_finish(&mut self, token: Option<&str>) -> Result<Value, Error> {
        let Some(token) = token else {
            return Err(Error::Refusal("write_incomplete"));
        };
        let (pin, parent, stage_name, w_fd, w_size, expected, intended) = {
            let Some(w) = self.writes.get(token) else {
                return Err(Error::Refusal("write_incomplete"));
            };
            if w.offset != w.size {
                return Err(Error::Refusal("write_incomplete"));
            }
            let Some(stage) = w.stage.clone() else {
                return Err(Error::Os(0));
            };
            (
                w.pin.clone(),
                Rc::clone(&w.parent),
                stage,
                Rc::clone(&w.fd),
                w.size,
                w.expected.clone(),
                w.digest.clone(),
            )
        };
        let checked_p = self.checked_parent(&pin)?;
        let stat_checked_p = self.stat(&*checked_p)?;
        let stat_parent = self.stat(&*parent)?;
        if identity(&stat_checked_p) != identity(&stat_parent) {
            return Err(Error::Refusal("stale_locator"));
        }
        rfs::fsync(&*w_fd).map_err(Error::from)?;
        self.verify_stage(&parent, &stage_name, &w_fd, w_size, &intended)?;

        let mut matched = (|| -> Result<bool, Error> {
            let fd = self.checked_fd(&pin, OFlags::RDONLY | OFlags::NONBLOCK)?;
            let before = self.stat(&fd)?;
            let mut m = false;
            if FileType::from_raw_mode(before.st_mode).is_file()
                && before.st_size as i64 == expected.size
                && version(&before) == expected.version
            {
                rfs::fchmod(&*w_fd, Mode::from_raw_mode(before.st_mode & 0o777))
                    .map_err(Error::from)?;
                rfs::fsync(&*w_fd).map_err(Error::from)?;
                if Self::digest_fd(&fd, before.st_size as u64)? == expected.digest {
                    let after = self.stat(&fd)?;
                    m = version(&after) == expected.version;
                }
            }
            if m {
                // This is a desktop-editor check immediately before replacement, not filesystem CAS.
                drop(self.checked_fd(&pin, OFlags::PATH)?);
                let after = self.stat(&fd)?;
                m = version(&after) == expected.version;
            }
            Ok(m)
        })()
        .unwrap_or(false);

        let mut name = leaf_name(&pin.path).to_string();
        if matched && intended == expected.digest && w_size as i64 == expected.size {
            let metadata = self.validate(Some(&pin.key))?;
            return Ok(json!({ "status": "unchanged", "metadata": metadata }));
        }
        // Never follow a changed parent, even when the draft needs a sibling copy.
        let checked_p = self.checked_parent(&pin)?;
        let stat_checked_p = self.stat(&*checked_p)?;
        let stat_parent = self.stat(&*parent)?;
        if identity(&stat_checked_p) != identity(&stat_parent) {
            return Err(Error::Refusal("stale_locator"));
        }
        self.verify_stage(&parent, &stage_name, &w_fd, w_size, &intended)?;
        if matched {
            // Recheck metadata after staging its permissions and flushing the complete bytes.
            matched = self
                .validate(Some(&pin.key))
                .ok()
                .and_then(|v| {
                    v.get("version")
                        .and_then(Value::as_str)
                        .map(|s| s == expected.version)
                })
                .unwrap_or(false);
        }
        if matched {
            rfs::renameat(&*parent, &stage_name, &*parent, &name).map_err(Error::from)?;
        } else {
            let (stem, extension) = splitext(&name);
            let (stem, extension) = (stem.to_string(), extension.to_string());
            let mut linked = false;
            for number in 1..1000 {
                name = if number == 1 {
                    format!("{stem} (edited){extension}")
                } else {
                    format!("{stem} (edited {number}){extension}")
                };
                match rfs::linkat(&*parent, &stage_name, &*parent, &name, AtFlags::empty()) {
                    Ok(()) => {
                        rfs::unlinkat(&*parent, &stage_name, AtFlags::empty())
                            .map_err(Error::from)?;
                        linked = true;
                        break;
                    }
                    Err(Errno::EXIST) => continue,
                    Err(err) => return Err(Error::from(err)),
                }
            }
            if !linked {
                return Err(Error::Refusal("copy_name_limit"));
            }
        }
        if let Some(w) = self.writes.get_mut(token) {
            w.stage = None;
        }
        rfs::fsync(&*parent).map_err(Error::from)?;
        self.metrics.writes += 1;
        let fd = openat2(&*parent, &name, OFlags::RDONLY | OFlags::NONBLOCK, BENEATH)?;
        let s = self.stat(&fd)?;
        let w_stat = self.stat(&*w_fd)?;
        if identity(&s) != identity(&w_stat)
            || s.st_size as u64 != w_size
            || Self::digest_fd(&fd, s.st_size as u64)? != intended
        {
            return Err(Error::Refusal("write_unverified"));
        }
        let metadata = json!({ "size": s.st_size, "version": version(&s) });
        drop(fd);
        self.checked_parent(&pin)?;
        if !matched {
            return Ok(json!({ "status": "kept-both", "destinationName": name }));
        }
        let row = self.lookup(&pin.path)?;
        Ok(json!({
            "status": "saved",
            "row": row,
            "metadata": metadata,
            "destinationName": name,
        }))
    }

    pub fn close(&mut self) {
        let write_keys: Vec<String> = self.writes.keys().cloned().collect();
        for key in write_keys {
            let _ = self.write_close(Some(&key));
        }
        let read_keys: Vec<String> = self.reads.keys().cloned().collect();
        for key in read_keys {
            self.read_close(Some(&key));
        }
        let cursor_keys: Vec<String> = self.cursors.keys().cloned().collect();
        for key in cursor_keys {
            self.list_close(Some(&key));
        }
        let pin_keys: Vec<String> = self.pins.keys().cloned().collect();
        for key in pin_keys {
            self.release(Some(&key));
        }
    }

    pub fn dispatch(&mut self, method: &str, args: &Value) -> Result<Value, String> {
        self.dispatch_inner(method, args).map_err(Error::into_code)
    }

    fn dispatch_inner(&mut self, method: &str, args: &Value) -> Result<Value, Error> {
        let framed_len = json!({"id": self.serial + 1, "method": method, "args": args})
            .to_string()
            .len()
            + 1;
        if framed_len > MAX_REQUEST || args.to_string().len() > MAX_REQUEST {
            return Err(Error::Refusal("request_limit"));
        }
        let req_key = |field: &str| -> Result<Option<&str>, Error> {
            match args.get(field) {
                Some(Value::String(s)) => Ok(Some(s.as_str())),
                Some(Value::Null | Value::Bool(_) | Value::Number(_)) => Ok(None),
                Some(Value::Array(_) | Value::Object(_)) | None => Err(Error::Os(0)),
            }
        };
        let req_val =
            |field: &str| -> Result<&Value, Error> { args.get(field).ok_or(Error::Os(0)) };
        let req_path = |field: &str| -> Result<&str, Error> {
            match req_val(field)? {
                Value::String(s) => Ok(s.as_str()),
                _ => Err(Error::Refusal("invalid_path")),
            }
        };
        match method {
            "hello" => Ok(json!({
                "root": self.root,
                "capabilities": {
                    "conditionalCommit": false,
                    "checkedSave": true,
                    "verifiedWriteBack": true,
                    "pinnedIdentity": true,
                    "confinedRead": true,
                    "coherentRead": true,
                    "parentAnchored": true,
                    "boundedEnumeration": true,
                    "provider": "linux"
                },
                "platform": platform_string(),
            })),
            "lookup" => self.lookup(req_path("path")?),
            "relative" => {
                let id = req_key("id")?;
                let path = req_path("path")?;
                self.relative(id, path)
            }
            "retain" => {
                let for_save = match args.get("forSave") {
                    None | Some(Value::Null) | Some(Value::Bool(false)) => false,
                    Some(Value::Bool(true)) => true,
                    Some(Value::Number(n)) => n.as_i64() != Some(0) && n.as_f64() != Some(0.0),
                    Some(Value::String(s)) => !s.is_empty(),
                    Some(Value::Array(a)) => !a.is_empty(),
                    Some(Value::Object(o)) => !o.is_empty(),
                };
                let id = req_key("id")?;
                if !for_save {
                    self.retain(id)
                } else {
                    self.retain_for_save(id)
                }
            }
            "release" => {
                let ids = req_val("ids")?.as_array().ok_or(Error::Os(0))?;
                let mut out = Vec::with_capacity(ids.len());
                for item in ids {
                    let key = match item {
                        Value::String(s) => Some(s.as_str()),
                        Value::Null | Value::Bool(_) | Value::Number(_) => None,
                        Value::Array(_) | Value::Object(_) => return Err(Error::Os(0)),
                    };
                    out.push(Value::Bool(self.release(key)));
                }
                Ok(Value::Array(out))
            }
            "validate" => self.validate(req_key("id")?),
            "readStart" => self.read_start(req_key("id")?),
            "readChunk" => {
                let read = req_key("read")?;
                let offset = req_val("offset")?;
                let length = req_val("length")?;
                self.read_chunk(read, offset, length)
            }
            "readClose" => Ok(json!(self.read_close(req_key("read")?))),
            "writeStart" => {
                let id = req_key("id")?;
                let size = req_val("size")?;
                let expected = req_val("expected")?;
                let digest = req_val("digest")?;
                self.write_start(id, size, expected, digest)
            }
            "writeChunk" => {
                let write = req_key("write")?;
                let offset = req_val("offset")?;
                let data = req_val("data")?;
                self.write_chunk(write, offset, data)
            }
            "writeFinish" => self.write_finish(req_key("write")?),
            "writeClose" => self.write_close(req_key("write")?),
            "listStart" => self.list_start(req_key("id")?),
            "listNext" => {
                let cursor = req_key("cursor")?;
                let limit = req_val("limit")?;
                self.list_next(cursor, limit)
            }
            "listClose" => Ok(json!(self.list_close(req_key("cursor")?))),
            "stats" => {
                let mut map = Map::new();
                map.insert("metadata".into(), json!(self.metrics.metadata));
                map.insert("entries".into(), json!(self.metrics.entries));
                map.insert("bodyReads".into(), json!(self.metrics.body_reads));
                map.insert("bodyBytes".into(), json!(self.metrics.body_bytes));
                map.insert("writes".into(), json!(self.metrics.writes));
                map.insert("pinsPeak".into(), json!(self.metrics.pins_peak));
                map.insert("cursorsPeak".into(), json!(self.metrics.cursors_peak));
                map.insert("chunkPeak".into(), json!(self.metrics.chunk_peak));
                map.insert("pins".into(), json!(self.pins.len()));
                map.insert("cursors".into(), json!(self.cursors.len()));
                map.insert("anchors".into(), json!(self.anchors));
                map.insert("reads".into(), json!(self.reads.len()));
                Ok(Value::Object(map))
            }
            _ => Err(Error::Refusal("unknown_operation")),
        }
    }
}

impl Drop for Broker {
    fn drop(&mut self) {
        self.close();
    }
}
