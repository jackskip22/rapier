// SPDX-License-Identifier: AGPL-3.0-only
// Actual production portal calls against a private D-Bus fixture. This is not desktop chooser UI evidence.
#[allow(dead_code)]
#[path = "../src/portal.rs"]
mod portal;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}, mpsc};
use std::time::{Duration, Instant};

fn random_hex(bytes: usize) -> String {
    let mut data = vec![0; bytes];
    File::open("/dev/urandom").unwrap().read_exact(&mut data).unwrap();
    data.iter().map(|b| format!("{b:02x}")).collect()
}
fn which(_: &str) -> Option<PathBuf> { None }
struct Fixture(Child);
impl Drop for Fixture { fn drop(&mut self) { let _ = self.0.kill(); let _ = self.0.wait(); } }
fn logs(root: &Path) -> Vec<Value> {
    fs::read_to_string(root.join("requests.jsonl")).unwrap_or_default().lines().filter_map(|s| serde_json::from_str(s).ok()).collect()
}
fn wait_for(mut ready: impl FnMut() -> bool) {
    let started = Instant::now();
    while !ready() {
        assert!(started.elapsed() < Duration::from_secs(10), "fixture did not reach the requested boundary");
        std::thread::sleep(Duration::from_millis(20));
    }
}
fn open_count(root: &Path) -> usize { logs(root).iter().filter(|v| v["method"] == "OpenURI.OpenFile").count() }

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let fixture = PathBuf::from(args.next().ok_or("fixture executable required")?).canonicalize()?;
    let root = PathBuf::from(args.next().ok_or("fresh result directory required")?);
    fs::create_dir(&root)?; let root = root.canonicalize()?;
    fs::write(root.join("next"), "CANCEL")?; fs::write(root.join("next-open"), "OPEN")?;
    let mut fixture = Fixture(Command::new(fixture).env("PORTAL_FIXTURE", &root)
        .stdout(Stdio::from(File::create(root.join("fixture.stdout"))?))
        .stderr(Stdio::from(File::create(root.join("fixture.stderr"))?)).spawn()?);
    wait_for(|| root.join("ready").exists());
    let mut cases = Vec::new();
    assert!(portal::attachment_open_available());
    fs::write(root.join("open-version"), "2")?; assert!(!portal::attachment_open_available());
    fs::write(root.join("open-version"), "3")?;
    cases.push(json!({"case":"capability-version", "passed":true}));
    let bytes = b"<!doctype html><script>window.untrusted=true</script>\0\xff\xfe\r\nexact attachment";
    let source = root.join("雪 & report.html"); fs::write(&source, bytes)?;
    fs::set_permissions(&source, fs::Permissions::from_mode(0o400))?;
    let digest = format!("{:x}", Sha256::digest(bytes));
    let mut file = File::open(&source)?;
    for (mode, expected) in [("OPEN", "opened"), ("CANCEL", "cancelled"), ("REFUSE", "refused"),
        ("DENY", "refused"), ("DISAPPEAR", "refused"), ("WRONG_HANDLE", "refused"), ("WRONG_SENDER", "cancelled")] {
        fs::write(root.join("next-open"), mode)?; file.seek(SeekFrom::Start(0))?;
        let before = open_count(&root);
        let started = Instant::now(); let result = portal::open_attachment(&file, "x11:abc", &AtomicBool::new(false));
        let outcome = match &result.result { Ok(true) => "opened", Ok(false) => "cancelled", Err(_) => "refused" };
        assert_eq!(outcome, expected, "{mode}: {result:?}");
        assert_eq!(result.retain, !matches!(mode, "CANCEL" | "REFUSE" | "WRONG_SENDER"), "{mode}: retention fact");
        // DENY and a wrong returned handle can settle before the fixture's independent FD reader.
        wait_for(|| open_count(&root) > before);
        let entry = logs(&root).into_iter().rev().find(|v| v["method"] == "OpenURI.OpenFile").unwrap();
        assert_eq!(entry["mode"], mode); assert_eq!(entry["ask"], true); assert_eq!(entry["writable"], false);
        assert_eq!(entry["readOnlyFd"], true); assert_eq!(entry["bytes"], bytes.len()); assert_eq!(entry["sha256"], digest);
        assert_eq!(entry["parent"], "x11:abc"); assert_eq!(fs::read(&source)?, bytes);
        cases.push(json!({"case":mode, "outcome":outcome, "retain":result.retain, "milliseconds":started.elapsed().as_millis(), "passed":true}));
    }
    let forgery = logs(&root).into_iter().find(|v| v["method"] == "Forged.Response").unwrap();
    assert_ne!(forgery["forgedSender"], forgery["portalSender"]);
    let count = open_count(&root); assert_eq!(portal::open_attachment(&file, "", &AtomicBool::new(true)),
        portal::AttachmentOutcome { result: Ok(false), retain: false });
    assert_eq!(open_count(&root), count);
    cases.push(json!({"case":"cancel-before-dispatch", "passed":true}));

    fs::write(root.join("next-open"), "STALL")?; file.seek(SeekFrom::Start(0))?;
    let cancelled = Arc::new(AtomicBool::new(false)); let stop = cancelled.clone(); let held = file.try_clone()?;
    let (answer, answered) = mpsc::channel();
    let call = std::thread::spawn(move || { let _ = answer.send(portal::open_attachment(&held, "", &stop)); });
    wait_for(|| open_count(&root) > count);
    let started = Instant::now(); cancelled.store(true, Ordering::Release);
    assert_eq!(answered.recv_timeout(Duration::from_secs(8))?,
        portal::AttachmentOutcome { result: Ok(false), retain: false }); call.join().unwrap();
    let request = logs(&root).into_iter().rev().find(|v| v["method"] == "OpenURI.OpenFile").unwrap();
    assert!(logs(&root).iter().any(|v| v["method"] == "Request.Close" && v["handle"] == request["handle"] && v["responseEmitted"] == false));
    wait_for(|| logs(&root).iter().any(|v| v["method"] == "Request.Closed" && v["handle"] == request["handle"] && v["removed"] == true));
    cases.push(json!({"case":"cancel-persistent-request-without-response", "milliseconds":started.elapsed().as_millis(), "passed":true}));

    // The logged Request is live while the FD worker is held. Cancel must reach Close and stop that worker.
    // If OpenFile wrongly waits for the reader, its method timeout returns Err instead of this required Ok(false).
    fs::write(root.join("hold-hash"), "pause only this fixture's descriptor reader")?;
    fs::write(root.join("next-open"), "OPEN")?; file.seek(SeekFrom::Start(0))?;
    let before = logs(&root).iter().filter(|v| v["method"] == "OpenURI.Request").count();
    let cancelled = Arc::new(AtomicBool::new(false)); let stop = cancelled.clone(); let held = file.try_clone()?;
    let (answer, answered) = mpsc::channel(); let started = Instant::now();
    let call = std::thread::spawn(move || { let _ = answer.send(portal::open_attachment(&held, "", &stop)); });
    wait_for(|| logs(&root).iter().filter(|v| v["method"] == "OpenURI.Request").count() > before);
    let request = logs(&root).into_iter().rev().find(|v| v["method"] == "OpenURI.Request").unwrap();
    cancelled.store(true, Ordering::Release);
    assert_eq!(answered.recv_timeout(Duration::from_secs(8))?,
        portal::AttachmentOutcome { result: Ok(false), retain: false }); call.join().unwrap();
    wait_for(|| logs(&root).iter().any(|v| v["method"] == "Request.Closed" && v["handle"] == request["handle"] && v["removed"] == true));
    wait_for(|| logs(&root).iter().any(|v| v["method"] == "FD.HashCancelled" && v["handle"] == request["handle"]));
    fs::remove_file(root.join("hold-hash"))?;
    assert!(logs(&root).iter().any(|v| v["method"] == "Request.Close" && v["handle"] == request["handle"] && v["responseEmitted"] == false));
    assert!(!logs(&root).iter().any(|v| v["method"] == "Request.Response" && v["handle"] == request["handle"]));
    cases.push(json!({"case":"cancel-during-pending-fd-read-without-late-response", "milliseconds":started.elapsed().as_millis(), "passed":true}));

    // The success signal is queued while the method reply is deliberately withheld.
    // Retirement after that signal must not turn delivered bytes into a canceled copy.
    fs::write(root.join("hold-open-return"), "hold method reply after success")?;
    fs::write(root.join("next-open"), "SUCCESS_BEFORE_RETURN")?; file.seek(SeekFrom::Start(0))?;
    let before = logs(&root).iter().filter(|v| v["method"] == "Request.Response").count();
    let cancelled = Arc::new(AtomicBool::new(false)); let stop = cancelled.clone(); let held = file.try_clone()?;
    let (answer, answered) = mpsc::channel();
    let call = std::thread::spawn(move || { let _ = answer.send(portal::open_attachment(&held, "", &stop)); });
    wait_for(|| logs(&root).iter().filter(|v| v["method"] == "Request.Response").count() > before);
    let response = logs(&root).into_iter().rev().find(|v| v["method"] == "Request.Response").unwrap();
    assert_eq!(response["code"], 0); assert_eq!(response["responseEmitted"], true);
    cancelled.store(true, Ordering::Release); fs::remove_file(root.join("hold-open-return"))?;
    assert_eq!(answered.recv_timeout(Duration::from_secs(8))?,
        portal::AttachmentOutcome { result: Ok(true), retain: true }); call.join().unwrap();
    cases.push(json!({"case":"queued-success-wins-over-cancel", "retain":true, "passed":true}));

    // The fixture actually emits success but never returns the initiating method reply.
    // The caller reports an unconfirmed error and must preserve, without inferring expiry.
    fs::write(root.join("next-open"), "SUCCESS_WITHOUT_RETURN")?; file.seek(SeekFrom::Start(0))?;
    let before = logs(&root).iter().filter(|v| v["method"] == "Request.Response").count();
    let lost = portal::open_attachment(&file, "", &AtomicBool::new(false));
    assert!(lost.result.is_err() && lost.retain);
    wait_for(|| logs(&root).iter().filter(|v| v["method"] == "Request.Response").count() > before);
    cases.push(json!({"case":"delivered-but-method-reply-lost", "retain":true, "passed":true}));

    fs::write(root.join("next"), "CANCEL")?;
    assert_eq!(portal::pick(false, "", "", false, &root, "")?, "");
    cases.push(json!({"case":"file-chooser-cancel", "passed":true}));
    fs::write(root.join("next"), "STALL_RESPONSE")?;
    let started = Instant::now(); assert!(portal::pick(false, "", "", false, &root, "").is_err());
    cases.push(json!({"case":"file-chooser-request-disappeared", "milliseconds":started.elapsed().as_millis(), "passed":true}));

    fs::write(root.join("next-open"), "STALL_CALL")?; file.seek(SeekFrom::Start(0))?;
    let started = Instant::now(); let timed_out = portal::open_attachment(&file, "", &AtomicBool::new(false));
    assert!(timed_out.result.is_err() && timed_out.retain);
    cases.push(json!({"case":"attachment-call-timeout", "milliseconds":started.elapsed().as_millis(), "passed":true}));

    fs::write(root.join("next-open"), "STALL")?; file.seek(SeekFrom::Start(0))?;
    let count = open_count(&root); let held = file.try_clone()?; let (answer, answered) = mpsc::channel();
    let call = std::thread::spawn(move || { let _ = answer.send(portal::open_attachment(&held, "", &AtomicBool::new(false))); });
    wait_for(|| open_count(&root) > count);
    let started = Instant::now(); fixture.0.kill()?; fixture.0.wait()?;
    let vanished = answered.recv_timeout(Duration::from_secs(8))?;
    assert!(vanished.result.is_err() && vanished.retain); call.join().unwrap();
    assert!(!portal::attachment_open_available());
    cases.push(json!({"case":"portal-service-disappeared", "milliseconds":started.elapsed().as_millis(), "passed":true}));
    assert_eq!(fs::read(&source)?, bytes);
    let result = json!({"scope":"production portal.rs; isolated real D-Bus and read-only file descriptors; no desktop chooser UI",
        "passed":cases.len(), "failed":0, "cases":cases, "sourceBytes":bytes.len(), "sourceSha256":digest,
        "portalSourceSha256":format!("{:x}",Sha256::digest(include_bytes!("../src/portal.rs"))),
        "fixtureSourceSha256":format!("{:x}",Sha256::digest(include_bytes!("fixture-portal.rs")))});
    fs::write(root.join("results.json"), serde_json::to_vec_pretty(&result)?)?;
    println!("{}", result);
    Ok(())
}
