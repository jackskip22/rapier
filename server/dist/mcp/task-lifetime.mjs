import {REQUEST_CANCELLED} from './request-lifetime.mjs';

export const TASK_EXTENSION = 'io.modelcontextprotocol/tasks';
export const TASK_TTL_MS = 86400000;

const PART_BYTES = 65536, MAX_RESULT_BYTES = 16 * 1024 * 1024, MAX_INPUT_BYTES = 65536;
const encode = new TextEncoder(), decode = new TextDecoder('utf-8', {fatal: true});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const completedResult = value => object(value) && Object.hasOwn(value, 'result') && object(value.result) && !Object.hasOwn(value, 'error');
const taskFailure = (message = 'Task unavailable.', code = -32602) => Object.assign(new Error(message), {code});
const protocolError = error => Number.isSafeInteger(error?.code) && typeof error.message === 'string'
  ? {code: error.code, message: error.message, ...(error.data !== undefined ? {data: error.data} : {})}
  : {code: -32603, message: 'Task execution failed.'};
const acknowledgement = () => ({resultType: 'complete'});

async function handleHash(taskId) {
  if (typeof taskId !== 'string' || !taskId || taskId.length > 512) throw taskFailure();
  const bytes = await crypto.subtle.digest('SHA-256', encode.encode(taskId));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

// One object owns one task. The document keeps the operation's publication receipt.
export class TaskLifetime {
  constructor(ctx, {execute, authorize, recover = null, clock = Date.now}) {
    this.ctx = ctx;
    this.execute = execute;
    this.authorize = authorize;
    this.recover = recover;
    this.clock = clock;
    this.queue = Promise.resolve();
    this.running = null;
    this.backgroundError = null;
  }

  exclusive(action) {
    const next = this.queue.then(action);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async permitted(input, authority) {
    try { return await this.authorize(input, authority) === true; }
    catch { return false; }
  }

  seed(record, taskId, resultType) {
    return {resultType, taskId, status: record.status,
      createdAt: new Date(record.createdAt).toISOString(),
      lastUpdatedAt: new Date(record.lastUpdatedAt).toISOString(),
      ttlMs: TASK_TTL_MS, pollIntervalMs: 1000,
      ...(record.statusMessage ? {statusMessage: record.statusMessage} : {})};
  }

  async discard() {
    this.running?.controller.abort(taskFailure('Task expired.', REQUEST_CANCELLED));
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
  }

  async admitted(hash, authority) {
    const record = this.ctx.storage.kv.get('task');
    if (!record || record.handleHash !== hash) throw taskFailure();
    if (this.clock() >= record.expiresAt) { await this.discard(); throw taskFailure(); }
    if (!await this.permitted(record.input, authority)) throw taskFailure();
    return record;
  }

  async schedule(record) {
    await this.ctx.storage.setAlarm(record.status === 'working'
      ? Math.min(record.expiresAt, Math.max(this.clock() + 1, Math.min(record.deadline, this.clock() + 1000)))
      : record.expiresAt);
  }

  start(record) {
    if (record.status !== 'working') return Promise.resolve();
    if (this.running) return this.running.promise;
    this.backgroundError = null;
    const running = {controller: new AbortController(), timer: null, deadline: false, promise: null};
    this.running = running;
    const expire = () => {
      const remaining = record.deadline - this.clock();
      if (remaining > 0) { running.timer = setTimeout(expire, Math.min(remaining, TASK_TTL_MS)); return; }
      running.deadline = true;
      running.controller.abort(taskFailure('Task execution deadline expired.', -32000));
    };
    if (record.cancelRequested) running.controller.abort(taskFailure('Task cancelled.', REQUEST_CANCELLED));
    else if (this.clock() >= record.deadline) expire();
    else running.timer = setTimeout(expire, Math.min(record.deadline - this.clock(), TASK_TTL_MS));
    running.promise = this.run(record, running).finally(() => {
      clearTimeout(running.timer);
      if (this.running === running) this.running = null;
    });
    running.promise.catch(error => { this.backgroundError = error; });
    this.ctx.waitUntil?.(running.promise);
    return running.promise;
  }

  async run(record, running) {
    let outcome, recovered = false;
    if (!await this.permitted(record.input, record.input.authority)) {
      outcome = {error: {code: -32602, message: 'Task unavailable.'}};
    } else {
      // Only the operation owner can attest that these exact bytes were published
      // before its deadline. A failed lookup leaves the checkpoint retryable.
      const retained = this.recover ? await this.recover(record.input) : null;
      if (retained !== null && retained !== undefined && !completedResult(retained))
        throw taskFailure('Task recovery failed.', -32603);
      if (completedResult(retained)) { outcome = retained; recovered = true; }
      else if (this.clock() >= record.deadline) {
        running.deadline = true;
        outcome = {error: {code: -32000, message: 'Task execution deadline expired.'}};
      } else {
        try { outcome = await this.execute(record.input, running.controller.signal); }
        catch (error) {
          // A cancelled task remains retryable until its operation owner confirms cleanup.
          if (error?.code === 'CANCELLATION_UNACKNOWLEDGED') throw error;
          outcome = {error: protocolError(error)};
        }
      }
    }
    clearTimeout(running.timer);
    await this.exclusive(async () => {
      const current = this.ctx.storage.kv.get('task');
      if (!current || current.handleHash !== record.handleHash || current.status !== 'working') return;
      if (this.clock() >= current.expiresAt) { await this.discard(); return; }
      const authorized = await this.permitted(current.input, current.input.authority);
      let payload;
      if (current.cancelRequested) {
        current.status = 'cancelled';
        current.statusMessage = 'Task cancelled.';
      } else if (!authorized) {
        current.status = 'failed';
        payload = {error: {code: -32602, message: 'Task unavailable.'}};
      } else if (running.deadline && !recovered) {
        current.status = 'failed';
        payload = {error: {code: -32000, message: 'Task execution deadline expired.'}};
      } else if (completedResult(outcome)) {
        current.status = 'completed';
        payload = {result: outcome.result};
      } else {
        current.status = 'failed';
        payload = {error: protocolError(outcome?.error)};
      }
      let bytes;
      try { bytes = payload ? encode.encode(JSON.stringify(payload)) : new Uint8Array(); }
      catch { bytes = null; }
      if (!bytes || bytes.byteLength > MAX_RESULT_BYTES) {
        current.status = 'failed';
        bytes = encode.encode(JSON.stringify({error: {code: -32603, message: 'Task result exceeds its storage limit.'}}));
      }
      current.lastUpdatedAt = this.clock();
      current.resultBytes = bytes.byteLength;
      current.resultParts = Math.ceil(bytes.byteLength / PART_BYTES);
      this.ctx.storage.transactionSync(() => {
        for (let index = 0; index < current.resultParts; index++) {
          this.ctx.storage.kv.put('result:' + index, bytes.slice(index * PART_BYTES, (index + 1) * PART_BYTES));
        }
        this.ctx.storage.kv.put('task', current);
      });
      await this.schedule(current);
      await this.ctx.storage.sync();
    });
  }

  async create(taskId, input, authority) {
    const hash = await handleHash(taskId);
    let serialized;
    try { serialized = JSON.stringify(input); }
    catch { throw taskFailure('Invalid task input.'); }
    if (!object(input) || typeof input.identity !== 'string' || !input.identity || input.identity.length > 256
      || !object(input.authority) || !Number.isSafeInteger(input.deadline) || input.deadline < 1
      || !serialized || encode.encode(serialized).byteLength > MAX_INPUT_BYTES) throw taskFailure('Invalid task input.');
    const checkpoint = JSON.parse(serialized);
    return this.exclusive(async () => {
      let record = this.ctx.storage.kv.get('task');
      if (record) {
        record = await this.admitted(hash, authority);
        if (record.input.identity !== checkpoint.identity) throw taskFailure();
        await this.schedule(record);
      } else {
        if (!await this.permitted(checkpoint, authority)) throw taskFailure();
        const now = this.clock();
        record = {handleHash: hash, input: checkpoint, createdAt: now, lastUpdatedAt: now,
          deadline: checkpoint.deadline, expiresAt: now + TASK_TTL_MS, status: 'working', cancelRequested: false};
        await this.ctx.storage.transaction(async () => {
          this.ctx.storage.kv.put('task', record);
          await this.schedule(record);
        });
      }
      await this.ctx.storage.sync();
      this.start(record);
      return this.seed(record, taskId, 'task');
    });
  }

  async get(taskId, authority) {
    const hash = await handleHash(taskId);
    return this.exclusive(async () => {
      const record = await this.admitted(hash, authority);
      if (this.backgroundError) {
        this.backgroundError = null;
        this.start(record);
        throw taskFailure('Task checkpoint failed.', -32603);
      }
      this.start(record);
      const result = this.seed(record, taskId, 'complete');
      if (record.status === 'completed' || record.status === 'failed') {
        if (!Number.isInteger(record.resultBytes) || record.resultBytes < 1 || record.resultBytes > MAX_RESULT_BYTES
          || record.resultParts !== Math.ceil(record.resultBytes / PART_BYTES)) throw taskFailure('Task result is incomplete.', -32603);
        const bytes = new Uint8Array(record.resultBytes);
        for (let index = 0; index < record.resultParts; index++) {
          const part = this.ctx.storage.kv.get('result:' + index);
          if (!(part instanceof Uint8Array) || part.byteLength !== Math.min(PART_BYTES, bytes.byteLength - index * PART_BYTES)) throw taskFailure('Task result is incomplete.', -32603);
          bytes.set(part, index * PART_BYTES);
        }
        let payload;
        try { payload = JSON.parse(decode.decode(bytes)); }
        catch { throw taskFailure('Task result is incomplete.', -32603); }
        if (record.status === 'completed' ? !object(payload.result) : !object(payload.error)) throw taskFailure('Task result is incomplete.', -32603);
        result[record.status === 'completed' ? 'result' : 'error'] = record.status === 'completed' ? payload.result : payload.error;
      }
      return result;
    });
  }

  async update(taskId, inputResponses, authority) {
    const hash = await handleHash(taskId);
    if (!object(inputResponses)) throw taskFailure('inputResponses must be an object.');
    return this.exclusive(async () => {
      const record = await this.admitted(hash, authority);
      this.start(record);
      return acknowledgement();
    });
  }

  async cancel(taskId, authority) {
    const hash = await handleHash(taskId);
    const work = await this.exclusive(async () => {
      const record = await this.admitted(hash, authority);
      if (record.status !== 'working') return null;
      record.cancelRequested = true;
      record.lastUpdatedAt = this.clock();
      this.ctx.storage.transactionSync(() => this.ctx.storage.kv.put('task', record));
      const settled = this.start(record);
      this.running?.controller.abort(taskFailure('Task cancelled.', REQUEST_CANCELLED));
      await this.ctx.storage.sync();
      return {settled};
    });
    if (work) await work.settled;
    return acknowledgement();
  }

  async alarm() {
    const work = await this.exclusive(async () => {
      const record = this.ctx.storage.kv.get('task');
      if (!record) return null;
      if (this.clock() >= record.expiresAt) { await this.discard(); return null; }
      if (record.status !== 'working') { await this.schedule(record); return null; }
      return {settled: this.start(record)};
    });
    if (work) await work.settled;
  }
}
