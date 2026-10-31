// SPDX-License-Identifier: AGPL-3.0-only
// Exercise the production in-process broker through the retained Node folder checks.
#[path = "../src/folder.rs"]
mod folder;

use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::args().nth(1).ok_or("expected a folder")?;
    let mut broker = folder::Broker::open(root)?;
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    loop {
        let mut line = Vec::new();
        let mut oversized = false;
        loop {
            let buffer = input.fill_buf()?;
            if buffer.is_empty() {
                return Ok(());
            }
            let count = buffer
                .iter()
                .position(|b| *b == b'\n')
                .map(|n| n + 1)
                .unwrap_or(buffer.len());
            let complete = buffer[count - 1] == b'\n';
            if line.len() + count <= folder::MAX_REQUEST && !oversized {
                line.extend_from_slice(&buffer[..count]);
            } else {
                oversized = true;
                line.clear();
            }
            input.consume(count);
            if complete {
                break;
            }
        }
        let frame: Value = if oversized {
            json!({})
        } else {
            serde_json::from_slice(&line).unwrap_or(json!({}))
        };
        let id = frame.get("id").cloned().unwrap_or(Value::Null);
        let result = if oversized {
            Err("request_limit".to_string())
        } else {
            broker.dispatch(frame["method"].as_str().unwrap_or(""), &frame["args"])
        };
        let reply = match result {
            Ok(value) => json!({"id": id, "value": value}),
            Err(error) => json!({"id": id, "error": error}),
        };
        writeln!(output, "{reply}")?;
        output.flush()?;
    }
}
