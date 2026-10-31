// SPDX-License-Identifier: AGPL-3.0-only
#[path = "../src/folder.rs"]
mod folder;

use folder::Broker;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::fs::hard_link;
use std::os::unix::fs::symlink;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "rapier-folder-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        fs::create_dir(path.join("selected")).unwrap();
        fs::write(path.join("selected/note.md"), b"original\n").unwrap();
        fs::write(path.join("outside.md"), b"outside\n").unwrap();
        Self(path)
    }
    fn root(&self) -> PathBuf {
        self.0.join("selected")
    }
    fn broker(&self) -> Broker {
        Broker::open(self.root()).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn row(broker: &mut Broker, path: &str) -> Value {
    broker.dispatch("lookup", &json!({"path": path})).unwrap()
}
fn start(broker: &mut Broker, row: &Value, bytes: &[u8]) -> Value {
    broker
        .dispatch(
            "writeStart",
            &json!({
                "id": row["id"], "size": bytes.len(), "digest": hash(bytes),
                "expected": {"size": 9, "version": row["version"], "digest": hash(b"original\n")}
            }),
        )
        .unwrap()
}
fn chunk(broker: &mut Broker, token: &Value, bytes: &[u8]) {
    use base64::Engine;
    broker
        .dispatch(
            "writeChunk",
            &json!({"write": token, "offset": 0,
        "data": base64::engine::general_purpose::STANDARD.encode(bytes)}),
        )
        .unwrap();
}
fn staging(root: &PathBuf) -> Vec<PathBuf> {
    fs::read_dir(root)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| {
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with(".rapier-save-")
        })
        .collect()
}

#[test]
fn confined_paths_and_links_never_admit_outside_bytes() {
    let f = Fixture::new();
    symlink("../outside.md", f.root().join("link.md")).unwrap();
    symlink(&f.root(), f.0.join("root-link")).unwrap();
    hard_link(f.0.join("outside.md"), f.root().join("hard.md")).unwrap();
    assert_eq!(
        Broker::open(f.0.join("root-link")).err().unwrap(),
        "symlink_refused"
    );
    let mut b = f.broker();
    for path in [
        "../outside.md",
        "/etc/passwd",
        "a/../note.md",
        "a\\b",
        "a//b",
        ".",
    ] {
        assert_eq!(
            b.dispatch("lookup", &json!({"path": path})),
            Err("invalid_path".into())
        );
    }
    assert_eq!(
        b.dispatch("lookup", &json!({"path": "link.md"})),
        Err("symlink_refused".into())
    );
    assert_eq!(
        b.dispatch("lookup", &json!({"path": "hard.md"})),
        Err("hardlink_refused".into())
    );
    assert_eq!(fs::read(f.0.join("outside.md")).unwrap(), b"outside\n");
}

#[test]
fn incomplete_and_dropped_writes_preserve_the_original_and_clean_owned_staging() {
    let f = Fixture::new();
    {
        let mut b = f.broker();
        let r = row(&mut b, "note.md");
        let token = start(&mut b, &r, b"replacement\n");
        chunk(&mut b, &token, b"partial");
        assert_eq!(
            b.dispatch("writeFinish", &json!({"write": token})),
            Err("write_incomplete".into())
        );
        assert_eq!(fs::read(f.root().join("note.md")).unwrap(), b"original\n");
        assert_eq!(staging(&f.root()).len(), 1);
    }
    assert!(staging(&f.root()).is_empty());
    assert_eq!(fs::read(f.root().join("note.md")).unwrap(), b"original\n");
}

#[test]
fn concurrent_edit_is_kept_and_draft_gets_an_exclusive_verified_sibling() {
    let f = Fixture::new();
    let mut b = f.broker();
    let r = row(&mut b, "note.md");
    let token = start(&mut b, &r, b"draft\n");
    chunk(&mut b, &token, b"draft\n");
    fs::write(f.root().join("note.md"), b"other editor\n").unwrap();
    fs::write(f.root().join("note (edited).md"), b"existing copy\n").unwrap();
    let reply = b.dispatch("writeFinish", &json!({"write": token})).unwrap();
    assert_eq!(reply["status"], "kept-both");
    assert_eq!(reply["destinationName"], "note (edited 2).md");
    assert_eq!(
        fs::read(f.root().join("note.md")).unwrap(),
        b"other editor\n"
    );
    assert_eq!(
        fs::read(f.root().join("note (edited).md")).unwrap(),
        b"existing copy\n"
    );
    assert_eq!(
        fs::read(f.root().join("note (edited 2).md")).unwrap(),
        b"draft\n"
    );
}

#[test]
fn checked_save_reopens_exact_bytes_and_unchanged_save_keeps_identity() {
    let f = Fixture::new();
    let mut b = f.broker();
    let r = row(&mut b, "note.md");
    let same = start(&mut b, &r, b"original\n");
    chunk(&mut b, &same, b"original\n");
    assert_eq!(
        b.dispatch("writeFinish", &json!({"write": same})).unwrap()["status"],
        "unchanged"
    );
    b.dispatch("writeClose", &json!({"write": same})).unwrap();
    assert_eq!(
        b.dispatch("validate", &json!({"id": r["id"]})).unwrap()["version"],
        r["version"]
    );
    let token = start(&mut b, &r, b"draft\n");
    chunk(&mut b, &token, b"draft\n");
    assert_eq!(
        b.dispatch("writeFinish", &json!({"write": token})).unwrap()["status"],
        "saved"
    );
    drop(b);
    let mut reopened = f.broker();
    let r = row(&mut reopened, "note.md");
    let read = reopened
        .dispatch("readStart", &json!({"id": r["id"]}))
        .unwrap();
    let bytes = reopened
        .dispatch(
            "readChunk",
            &json!({"read": read["read"], "offset": 0, "length": 65536}),
        )
        .unwrap();
    assert_eq!(bytes["data"], "ZHJhZnQK");
    reopened
        .dispatch("readClose", &json!({"read": read["read"]}))
        .unwrap();
    assert!(staging(&f.root()).is_empty());
}

#[test]
fn swapped_stage_is_refused_and_cleanup_does_not_unlink_the_replacement() {
    let f = Fixture::new();
    let mut b = f.broker();
    let r = row(&mut b, "note.md");
    let token = start(&mut b, &r, b"draft\n");
    chunk(&mut b, &token, b"draft\n");
    let stage = staging(&f.root()).pop().unwrap();
    fs::rename(&stage, f.root().join("held.tmp")).unwrap();
    fs::write(&stage, b"someone else's file").unwrap();
    assert_eq!(
        b.dispatch("writeFinish", &json!({"write": token})),
        Err("stage_changed".into())
    );
    drop(b);
    assert_eq!(fs::read(&stage).unwrap(), b"someone else's file");
    assert_eq!(fs::read(f.root().join("note.md")).unwrap(), b"original\n");
}

#[test]
fn replacing_a_parent_or_root_revokes_the_saved_authority() {
    let f = Fixture::new();
    fs::create_dir(f.root().join("notes")).unwrap();
    fs::rename(f.root().join("note.md"), f.root().join("notes/note.md")).unwrap();
    let mut b = f.broker();
    let r = row(&mut b, "notes/note.md");
    let token = start(&mut b, &r, b"draft\n");
    chunk(&mut b, &token, b"draft\n");
    fs::rename(f.root().join("notes"), f.root().join("held")).unwrap();
    fs::create_dir(f.root().join("notes")).unwrap();
    fs::write(f.root().join("notes/note.md"), b"decoy\n").unwrap();
    assert_eq!(
        b.dispatch("writeFinish", &json!({"write": token})),
        Err("stale_locator".into())
    );
    drop(b);
    assert_eq!(
        fs::read(f.root().join("notes/note.md")).unwrap(),
        b"decoy\n"
    );
    assert_eq!(
        fs::read(f.root().join("held/note.md")).unwrap(),
        b"original\n"
    );
    let mut b = f.broker();
    fs::rename(f.root(), f.0.join("held-root")).unwrap();
    fs::create_dir(f.root()).unwrap();
    assert_eq!(
        b.dispatch("lookup", &json!({"path": ""})),
        Err("stale_root".into())
    );
}

#[test]
fn oversized_request_refuses_without_losing_other_authority() {
    let f = Fixture::new();
    let mut b = f.broker();
    let r = row(&mut b, "note.md");
    assert_eq!(
        b.dispatch("lookup", &json!({"path": "x".repeat(16384)})),
        Err("request_limit".into())
    );
    assert!(b.dispatch("validate", &json!({"id": r["id"]})).is_ok());
}
