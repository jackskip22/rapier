// SPDX-License-Identifier: AGPL-3.0-only
import {createInterface} from 'node:readline';
import {readFile, writeFile, rename, rm} from 'node:fs/promises';
import {join} from 'node:path';

export const DOOR_FILE = 'door.json';
const LEGACY_VERSION = '2025-11-25';

export async function runningDoor(root) {
  try {
    const door = JSON.parse(await readFile(join(root, '.rapier-server', DOOR_FILE), 'utf8'));
    const credentials = JSON.parse(await readFile(join(root, '.rapier-server', 'credentials.json'), 'utf8'));
    if (!Number.isSafeInteger(door.pid) || !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(door.origin || '') || typeof credentials.token !== 'string') return null;
    try { process.kill(door.pid, 0); } catch (error) { if (error.code === 'ESRCH') return null; }
    return {origin: door.origin, token: credentials.token};
  } catch { return null; }
}

export async function recordDoor(root, origin) {
  const path = join(root, '.rapier-server', DOOR_FILE), temporary = path + '.' + process.pid;
  await writeFile(temporary, JSON.stringify({pid: process.pid, origin}), {mode: 0o600});
  await rename(temporary, path);
  return () => rm(path, {force: true});
}

export function bridgeStdio({origin, token, reconnect = null, input = process.stdin, output = process.stdout, fetchImpl = fetch}) {
  let version = LEGACY_VERSION, session = null, target = {origin, token}, moving = null;
  const write = message => output.write(JSON.stringify(message) + '\n');
  const failure = (id, message) => { if (id !== undefined && id !== null) write({jsonrpc: '2.0', id, error: {code: -32603, message}}); };
  const relay = async line => {
    let message;
    try { message = JSON.parse(line); } catch { return write({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}}); }
    if (message?.method === 'initialize' && typeof message.params?.protocolVersion === 'string') version = message.params.protocolVersion;
    const stated = message?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
    const params = message?.params || {}, method = typeof message?.method === 'string' ? message.method : '';
    const named = method.startsWith('tasks/') ? params.taskId : ['tools/call', 'prompts/get'].includes(method) ? params.name : method === 'resources/read' ? params.uri : undefined;
    const post = () => fetchImpl(target.origin + '/mcp', {method: 'POST', body: line, headers: {'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + target.token, 'MCP-Protocol-Version': typeof stated === 'string' ? stated : version,
      ...(typeof stated === 'string' && method ? {'Mcp-Method': method, ...(typeof named === 'string' ? {'Mcp-Name': named} : {})} : {}),
      ...(session ? {'Mcp-Session-Id': session} : {})}});
    try {
      let response;
      try { response = await post(); }
      catch (error) {
        if (!reconnect) throw error;
        const from = target.origin;
        moving ??= Promise.resolve(reconnect()).then(next => { if (next && target.origin === from) { target = next; session = null; } }).finally(() => { moving = null; });
        await moving;
        response = await post();
      }
      session = response.headers.get('Mcp-Session-Id') || session;
      const type = response.headers.get('Content-Type') || '', body = await response.text();
      if (!body) return;
      if (type.startsWith('text/event-stream')) {
        for (const event of body.split(/\r?\n\r?\n/)) {
          const data = event.split(/\r?\n/).filter(row => row.startsWith('data:')).map(row => row.slice(5).trimStart()).join('\n');
          if (data) write(JSON.parse(data));
        }
        return;
      }
      const answer = JSON.parse(body);
      if (message?.method === 'initialize' && typeof answer?.result?.protocolVersion === 'string') version = answer.result.protocolVersion;
      write(answer);
    } catch { failure(message?.id, 'The local Rapier Door did not answer.'); }
  };
  const lines = createInterface({input, crlfDelay: Infinity}), pending = new Set();
  lines.on('line', line => {
    if (!line.trim()) return;
    const task = relay(line).finally(() => pending.delete(task));
    pending.add(task);
  });
  return new Promise(resolve => lines.once('close', () => Promise.allSettled([...pending]).then(() => resolve())));
}
