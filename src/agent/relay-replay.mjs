// SPDX-License-Identifier: AGPL-3.0-only
import {resolveCaller} from './door-identity.mjs';

export async function replayIntents(kernel, intents, {signal} = {}) {
  const acks = [];
  for (const entry of intents) {
    if (signal?.aborted) break;
    const {principal, hostAgent} = entry.agent || {};
    if (typeof principal !== 'string' || !principal || !entry.intent || typeof entry.intent !== 'object') {
      acks.push({id: entry.id, outcome: 'refused', reason: 'intent_invalid'}); continue;
    }
    const caller = {...resolveCaller({actor: 'agent', principal, ...(entry.operationId ? {requestId: entry.operationId} : {})}, {transport: 'mcp'}),
      ...(hostAgent ? {hostAgent} : {}), ...(signal ? {signal} : {})};
    let result;
    try { result = await kernel.invoke('edit', entry.intent, caller); }
    catch { result = {outcome: 'uncertain', reason: 'replay_failed'}; }
    acks.push({id: entry.id, outcome: result.outcome, ...(result.reason ? {reason: result.reason} : {}),
      ...(typeof result.act === 'string' ? {act: result.act} : result.act?.id ? {act: result.act.id} : {}),
      ...(result.revision !== undefined ? {revision: result.revision} : {}), ...(result.hash ? {hash: result.hash} : {})});
  }
  return acks;
}
