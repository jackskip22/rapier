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
