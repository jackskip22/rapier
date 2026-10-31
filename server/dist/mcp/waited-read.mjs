// SPDX-License-Identifier: AGPL-3.0-only

const TYPING_RECHECK_MS = 500, ANSWER_MARGIN_MS = 500;

export function changeSignal() {
  let waiters = new Set();
  return {
    notify() { const woken = waiters; waiters = new Set(); for (const wake of woken) wake(); },
    next(ms, signal) {
      return new Promise((resolve, reject) => {
        let timer = null;
        const done = () => { clearTimeout(timer); waiters.delete(done); signal?.removeEventListener('abort', aborted); resolve(); };
        const aborted = () => { clearTimeout(timer); waiters.delete(done); reject(new DOMException('Request canceled', 'AbortError')); };
        if (signal?.aborted) return aborted();
        waiters.add(done);
        timer = setTimeout(done, Math.max(0, ms));
        signal?.addEventListener('abort', aborted, {once: true});
      });
    },
    get size() { return waiters.size; },
  };
}

export function validWait(value, operation) {
  return operation === 'read' && value !== null && typeof value === 'object' && Object.keys(value).length === 2 &&
    Number.isSafeInteger(value.after) && value.after >= 0 && Number.isSafeInteger(value.waitMs) && value.waitMs >= 0 && value.waitMs <= 20000;
}

export async function waitInObject(owner, input, signal) {
  const {after, waitMs} = input.waitFor, started = Date.now();
  const visual = input.args.as === 'image';
  const copy = extra => {
    const next = {...input, ...extra};
    delete next.waitFor;
    Object.defineProperty(next, 'signal', {value: signal});
    return next;
  };
  for (;;) {
    signal?.throwIfAborted();
    const result = await owner.peek(copy({peek: true, operationId: crypto.randomUUID(),
      ...(visual ? {args: {...input.args, as: 'text'}} : {})}));
    const value = result.structuredContent, waited = Date.now() - started;
    if (result.isError || !value) return result;
    const changed = (value.documentRevision ?? value.revision) > after, editing = value.human?.editing === true;
    if (waited + ANSWER_MARGIN_MS > waitMs || value.messagesQueued > 0 || (changed && !editing) ||
        visual && value.human?.active !== true) break;
    await owner.changes.next(changed && editing ? TYPING_RECHECK_MS : waitMs - ANSWER_MARGIN_MS - waited, signal);
  }
  const result = await owner.answer(copy({}));
  const value = result.structuredContent;
  if (value && !result.isError) result.structuredContent = {...value, waited_ms: Date.now() - started,
    changed: (value.documentRevision ?? value.revision) > after};
  return result;
}
