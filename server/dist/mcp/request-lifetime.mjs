export const REQUEST_CANCELLED = -32800;

export function createRequestLifetime(signal) {
  const controller = new AbortController();
  const release = () => signal?.removeEventListener('abort', abort);
  const cancel = reason => {
    if (controller.signal.aborted) return false;
    release();
    controller.abort(reason ?? new DOMException('Request cancelled.', 'AbortError'));
    return true;
  };
  const abort = () => cancel(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, {once: true});
  return {signal: controller.signal, cancel, release};
}

// JSON whitespace keeps a pending response writable without buffering its result.
export async function responsiveJson(pendingResponsePromise, {signal, onDisconnect} = {}) {
  const pending = Promise.resolve(pendingResponsePromise), waiting = Symbol();
  const newline = new Uint8Array([10]);
  let grace, heartbeat, controller, reader, closed = false, reason, disconnecting;
  const cleanup = () => {
    clearTimeout(grace);
    clearInterval(heartbeat);
    signal?.removeEventListener('abort', abort);
  };
  const disconnect = (cause, end = 'error') => {
    if (closed) return disconnecting;
    closed = true;
    reason = cause ?? new DOMException('Request cancelled.', 'AbortError');
    cleanup();
    if (end === 'close') controller?.close();
    else if (end === 'error') controller?.error(reason);
    let notification;
    try { notification = onDisconnect?.(reason); }
    catch (error) { notification = Promise.reject(error); }
    disconnecting = Promise.all([
      notification,
      reader?.cancel(reason).finally(() => reader.releaseLock()),
    ]).then(() => undefined);
    return disconnecting;
  };
  const abort = () => {
    disconnect(signal.reason, 'close')?.catch(error => controller?.error(error));
  };
  signal?.addEventListener('abort', abort, {once: true});
  if (signal?.aborted) abort();
  let response;
  try {
    response = await Promise.race([pending, new Promise(resolve => {
      grace = setTimeout(() => resolve(waiting), 25);
    })]);
  } catch (error) {
    cleanup();
    if (closed && error?.name === 'AbortError') {
      await disconnecting;
      return new Response(null, {status: 499});
    }
    closed = true;
    throw error;
  } finally {
    clearTimeout(grace);
  }
  if (closed) {
    await disconnecting;
    try {
      const abandoned = response === waiting ? await pending : response;
      await abandoned.body?.cancel(reason);
    } catch (error) {
      if (error?.name !== 'AbortError') throw error;
    }
    return new Response(null, {status: 499});
  }
  if (response !== waiting) {
    closed = true;
    cleanup();
    return response;
  }
  const ready = pending.then(async value => {
    clearInterval(heartbeat);
    if (closed) {
      await value.body?.cancel(reason);
      return null;
    }
    reader = value.body?.getReader();
    return reader;
  });
  const body = new ReadableStream({
    start(value) {
      controller = value;
      if (closed) { controller.error(reason); return; }
      controller.enqueue(newline);
      heartbeat = setInterval(() => {
        if (closed || controller.desiredSize <= 0) return;
        try { controller.enqueue(newline); }
        catch (error) { disconnect(error)?.catch(failure => controller.error(failure)); }
      }, 100);
    },
    async pull(value) {
      try {
        const source = await ready;
        if (closed) return;
        const chunk = source ? await source.read() : {done: true};
        if (closed) return;
        if (chunk.done) {
          closed = true;
          cleanup();
          reader?.releaseLock();
          value.close();
        } else value.enqueue(chunk.value);
      } catch (error) {
        await disconnect(error);
      }
    },
    cancel: cause => disconnect(cause, 'cancel'),
  });
  ready.catch(error => {
    disconnect(error)?.catch(failure => controller.error(failure));
  });
  return new Response(body, {headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Encoding': 'identity',
    'Cache-Control': 'no-store, no-transform',
  }});
}

// A pending observation owns one timer and abort listener. Settlement releases both
// before its owner can publish another wait; durable writes never use this helper.
export function createRequestWait({signal, timeoutMs, onFinish}) {
  let resolve, timer, pending = true;
  const promise = new Promise(done => { resolve = done; });
  const settle = result => {
    if (!pending) return false;
    pending = false;
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    onFinish?.(waiter);
    resolve(result);
    return true;
  };
  const abort = () => settle({kind: 'aborted'});
  const waiter = {promise, finish: value => settle({kind: 'value', value})};
  if (signal?.aborted) abort();
  else {
    signal?.addEventListener('abort', abort, {once: true});
    timer = setTimeout(() => settle({kind: 'timeout'}), timeoutMs);
  }
  return waiter;
}
