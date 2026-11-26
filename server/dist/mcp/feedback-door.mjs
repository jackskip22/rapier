// SPDX-License-Identifier: AGPL-3.0-only
import {VERSION} from '../version.mjs';
import {FEEDBACK_MAX_TEXT, FEEDBACK_MAX_HOST, FEEDBACK_TOOLS} from '../agent/catalog.mjs';

export const FEEDBACK_REPLY = 'Thanks. The Rapier team reads every report and works on a fix.';
export const FEEDBACK_WINDOW_MS = 600000, FEEDBACK_WINDOW_LIMIT = 60;
const TOOLS = new Set(FEEDBACK_TOOLS);

export const FEEDBACK_SCHEMA = [
  'ALTER TABLE feedback ADD COLUMN tool TEXT',
  'ALTER TABLE feedback ADD COLUMN host TEXT',
];
const RATE_SCHEMA = 'CREATE TABLE IF NOT EXISTS agent_feedback_rate (bucket INTEGER PRIMARY KEY, count INTEGER NOT NULL CHECK(count >= 1))';
const ADMIT = 'INSERT INTO agent_feedback_rate(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count';
const WRITE = `INSERT INTO feedback(id,kind,message,version,source,tool,host) VALUES(?,'other',?,?,'agent',?,?)`;
const REFUND = ['DELETE FROM agent_feedback_rate WHERE bucket=? AND count=1', 'UPDATE agent_feedback_rate SET count=count-1 WHERE bucket=? AND count>1'];
const PRUNE = 'DELETE FROM agent_feedback_rate WHERE bucket < ?';
const ready = new WeakSet();

export function checkFeedback(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {error: 'Send {text}.'};
  for (const key of Object.keys(args)) if (!['text', 'tool', 'host', 'agent', 'operation_id'].includes(key)) return {error: `Unknown field ${key}.`};
  const text = typeof args.text === 'string' ? args.text.trim() : '';
  if (!text || text.length > FEEDBACK_MAX_TEXT) return {error: `text is one short line, 1 to ${FEEDBACK_MAX_TEXT} characters.`};
  if (args.tool !== undefined && !TOOLS.has(args.tool)) return {error: 'tool is one of the Rapier tool names.'};
  if (args.host !== undefined && (typeof args.host !== 'string' || args.host.length > FEEDBACK_MAX_HOST)) return {error: `host is at most ${FEEDBACK_MAX_HOST} characters.`};
  return {text, tool: args.tool ?? null, host: args.host ? args.host.trim() || null : null};
}

export async function storeFeedback(env, fields, now = Date.now()) {
  const db = env?.FEEDBACK_DB;
  if (!db) return 'unavailable';
  try {
    if (!ready.has(db)) {
      await db.prepare(RATE_SCHEMA).run();
      for (const sql of FEEDBACK_SCHEMA) { try { await db.prepare(sql).run(); } catch (error) { if (!/duplicate column/i.test(String(error?.message))) throw error; } }
      ready.add(db);
    }
    const bucket = Math.floor(now / FEEDBACK_WINDOW_MS);
    const admitted = await db.prepare(ADMIT).bind(bucket, FEEDBACK_WINDOW_LIMIT).first();
    if (!admitted) return 'rate_limited';
    let write = null;
    try {
      if (admitted.count === 1) await db.prepare(PRUNE).bind(bucket - 6).run();
      write = await db.prepare(WRITE).bind(crypto.randomUUID(), fields.text, VERSION, fields.tool, fields.host).run();
    } catch (_) { write = null; }
    if (!write?.success) {
      for (const sql of REFUND) await db.prepare(sql).bind(bucket).run().catch(() => {});
      return 'unavailable';
    }
    return 'stored';
  } catch (_) { return 'unavailable'; }
}
