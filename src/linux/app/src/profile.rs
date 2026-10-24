// SPDX-License-Identifier: AGPL-3.0-only
use std::io;
use std::os::unix::fs::MetadataExt;
use std::os::unix::net::UnixStream;
use std::path::Path;

/// The host already holds Rapier's instance socket. A restored profile can still
/// name another machine; keep any answering browser and every other profile file.
pub fn release_foreign_lock(profile: &Path) -> io::Result<bool> {
    let mut name = [0u8; 256];
    if unsafe { libc::gethostname(name.as_mut_ptr().cast(), name.len()) } != 0 {
        return Ok(false);
    }
    let end = name.iter().position(|byte| *byte == 0).unwrap_or(name.len());
    release_for_host(profile, &String::from_utf8_lossy(&name[..end]))
}

fn release_for_host(profile: &Path, hostname: &str) -> io::Result<bool> {
    // An unknown lock shape is Chromium's decision, never a host startup failure.
    Ok(try_release_for_host(profile, hostname).unwrap_or(false))
}

fn try_release_for_host(profile: &Path, hostname: &str) -> io::Result<bool> {
    // A missing local socket says nothing about a browser on a shared filesystem.
    let directory = std::fs::File::open(profile)?;
    if !crate::files::LOCAL_FILESYSTEMS.contains(&(rustix::fs::fstatfs(&directory)?.f_type as i64)) {
        return Ok(false);
    }
    let lock = profile.join("SingletonLock");
    let target = match std::fs::read_link(&lock) {
        Ok(target) => target,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    let Some((host, pid)) = target.to_str().and_then(|name| name.rsplit_once('-')) else { return Ok(false); };
    if host.is_empty() || host == hostname || pid.parse::<u32>().ok().filter(|pid| *pid > 0).is_none() {
        return Ok(false);
    }
    let identity = std::fs::symlink_metadata(&lock)?;
    // Chromium's socket is a symlink into a short temporary directory. Follow
    // that name before connect: the profile itself may exceed sockaddr_un.
    let socket = profile.join("SingletonSocket");
    let address = match std::fs::read_link(&socket) {
        Ok(target) => Some(if target.is_absolute() { target } else { profile.join(target) }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) if error.kind() == io::ErrorKind::InvalidInput => Some(socket),
        Err(error) => return Err(error),
    };
    if let Some(address) = address {
        match UnixStream::connect(address) {
            Ok(_) => return Ok(false),
            Err(error) if matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::ConnectionRefused) => {},
            Err(error) => return Err(error),
        }
    }
    let current = std::fs::symlink_metadata(&lock)?;
    if current.ino() != identity.ino() || current.dev() != identity.dev() || std::fs::read_link(&lock)? != target {
        return Ok(false);
    }
    std::fs::remove_file(lock)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::{fs::symlink, net::UnixListener};

    #[test]
    fn unfamiliar_lock_shapes_leave_startup_to_chromium() {
        let dir = std::env::temp_dir().join(format!("rapier-profile-shapes-{}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let lock = dir.join("SingletonLock");
        std::fs::write(&lock, b"remote-host-1234").unwrap();
        assert!(!release_for_host(&dir, "local").unwrap());
        assert_eq!(std::fs::read(&lock).unwrap(), b"remote-host-1234");
        std::fs::remove_file(&lock).unwrap();
        std::fs::create_dir(&lock).unwrap();
        assert!(!release_for_host(&dir, "local").unwrap());
        assert!(lock.is_dir());
        std::fs::remove_dir(&lock).unwrap();
        symlink("remote-host-1234", &lock).unwrap();
        let socket = dir.join("SingletonSocket");
        symlink(&socket, &socket).unwrap();
        assert!(!release_for_host(&dir, "local").unwrap());
        assert_eq!(std::fs::read_link(&lock).unwrap().to_str(), Some("remote-host-1234"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn only_a_foreign_lock_without_an_answering_browser_is_released() {
        let dir = std::env::temp_dir().join(format!("rapier-profile-lock-{}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let lock = dir.join("SingletonLock");
        let socket = dir.join("SingletonSocket");
        std::fs::write(dir.join("kept-document"), b"exact\r\n").unwrap();
        assert!(!release_for_host(&dir, "local").unwrap());
        for target in ["local-1234", "remote-no-pid", "remote-0"] {
            symlink(target, &lock).unwrap();
            assert!(!release_for_host(&dir, "local").unwrap());
            assert_eq!(std::fs::read_link(&lock).unwrap().to_str(), Some(target));
            std::fs::remove_file(&lock).unwrap();
        }
        symlink("remote-host-1234", &lock).unwrap();
        let listener = UnixListener::bind(&socket).unwrap();
        assert!(!release_for_host(&dir, "local").unwrap(), "a live browser keeps its lock");
        drop(listener);
        assert!(release_for_host(&dir, "local").unwrap(), "a refused socket cannot hold a restored profile");
        std::fs::remove_file(&socket).unwrap();
        symlink("remote-host-1234", &lock).unwrap();
        assert!(release_for_host(&dir, "local").unwrap(), "a missing socket cannot hold a restored profile");
        assert_eq!(std::fs::read(dir.join("kept-document")).unwrap(), b"exact\r\n");
        let long = dir.join("profile-".repeat(20));
        std::fs::create_dir(&long).unwrap();
        symlink("remote-host-1234", long.join("SingletonLock")).unwrap();
        assert!(release_for_host(&long, "local").unwrap(), "a long profile with no socket is still stale");
        symlink("remote-host-1234", long.join("SingletonLock")).unwrap();
        let listener = UnixListener::bind(&socket).unwrap();
        symlink(&socket, long.join("SingletonSocket")).unwrap();
        assert!(!release_for_host(&long, "local").unwrap(), "a long profile can still point to a live short socket");
        drop(listener);
        assert!(release_for_host(&long, "local").unwrap());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
