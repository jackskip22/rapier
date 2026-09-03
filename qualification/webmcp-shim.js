/* A competition-informed WebMCP test double, installed before Rapier's own script runs. It
   rejects duplicate names, stringifies schemas/results, honours a registration AbortSignal,
   and cancels modeled in-flight work when registration ends. Those are fixture choices used
   to exercise Rapier's adapter; only the observation-only native runner reports a substrate. */
window.__installWebMcpShim = function () {
  const tools = new Map();
  const listeners = new Set();
  /* Test-only counters so a harness can tell "left alone" from "re-registered identically". */
  const stats = { registrations: 0, unregistrations: 0, cancelled: [] };

  function notifyChange() {
    for (const fn of listeners) { try { fn(new Event('toolchange')); } catch (_) {} }
  }

  /* Modeled lifetime rule: the tool going away takes its running executions with it. */
  function cancelInFlight(entry) {
    for (const call of entry.calls) {
      if (call.settled) continue;
      call.settled = true;
      stats.cancelled.push(entry.name);
      call.controller.abort(new DOMException('tool unregistered: ' + entry.name, 'AbortError'));
      call.reject(new DOMException('tool unregistered: ' + entry.name, 'AbortError'));
    }
    entry.calls.length = 0;
  }

  const modelContext = {
    async registerTool(tool, options) {
      const opts = options || {};
      if (!tool || typeof tool !== 'object') throw new TypeError('tool is required');
      const name = String(tool.name == null ? '' : tool.name);
      const description = String(tool.description == null ? '' : tool.description);
      if (!name) throw new TypeError('tool name must not be empty');
      if (!description) throw new TypeError('tool description must not be empty');
      if (tools.has(name)) throw new DOMException('duplicate tool name: ' + name, 'InvalidStateError');
      if (tool.inputSchema !== undefined) {
        // This fixture rejects a schema it cannot serialize.
        try { JSON.stringify(tool.inputSchema); }
        catch (_) { throw new TypeError('inputSchema must be JSON-serializable'); }
      }
      if (typeof tool.execute !== 'function') throw new TypeError('execute must be a function');

      const entry = {
        name,
        title: tool.title == null ? undefined : String(tool.title),
        description,
        inputSchema: tool.inputSchema,
        annotations: Object.assign({ readOnlyHint: false, untrustedContentHint: false },
          tool.annotations || {}),
        execute: tool.execute,
        origin: location.origin,
        window,
        calls: [],
      };
      tools.set(name, entry);
      stats.registrations++;

      if (opts.signal) {
        if (opts.signal.aborted) {
          tools.delete(name);
          stats.unregistrations++;
          notifyChange();
          return;
        }
        opts.signal.addEventListener('abort', () => {
          if (tools.get(name) !== entry) return;
          tools.delete(name);
          stats.unregistrations++;
          cancelInFlight(entry);
          notifyChange();
        }, { once: true });
      }
      notifyChange();
    },

    async getTools() {
      return Array.from(tools.values()).map(entry => ({
        name: entry.name, title: entry.title, description: entry.description,
        inputSchema: JSON.stringify(entry.inputSchema), annotations: entry.annotations,
        origin: entry.origin, window: entry.window,
      }));
    },

    /* Returns the modeled stringified result. Native mode records the actual substrate. */
    executeTool(tool, inputJson, options) {
      const name = String(tool && tool.name || '');
      const entry = tools.get(name);
      if (!entry) return Promise.reject(new DOMException('no such tool: ' + name, 'NotFoundError'));
      if (typeof inputJson !== 'string') return Promise.reject(new TypeError('tool input must be JSON text'));
      let inputObject;
      try { inputObject = JSON.parse(inputJson); }
      catch (_) { return Promise.reject(new TypeError('tool input must be valid JSON')); }
      const opts = options || {};
      const controller = new AbortController();
      if (opts.signal && opts.signal.aborted) {
        return Promise.reject(opts.signal.reason || new DOMException('tool call aborted', 'AbortError'));
      }
      const call = { controller, settled: false, reject: null };
      entry.calls.push(call);
      return new Promise((resolve, reject) => {
        call.reject = reject;
        if (opts.signal) opts.signal.addEventListener('abort', () => {
          if (call.settled) return;
          call.settled = true;
          controller.abort(opts.signal.reason);
          reject(opts.signal.reason || new DOMException('tool call aborted', 'AbortError'));
        }, { once: true });
        let running;
        /* This fixture calls the registered callback with args only, exercising the
           competition-reported shape without asserting that an unexecuted browser does so. */
        try { running = entry.execute(inputObject); }
        catch (error) { call.settled = true; reject(error); return; }
        /* Registered here, synchronously, so the callback's own result reaches this promise in
           the first reaction job after it resolves — which is what puts it in a real race with
           an abort that the page fires from inside the callback. */
        Promise.resolve(running).then(value => {
          if (call.settled) return;
          call.settled = true;
          resolve(JSON.stringify(value === undefined ? null : value));
        }, error => {
          if (call.settled) return;
          call.settled = true;
          reject(error);
        });
      });
    },

    addEventListener(type, fn) { if (type === 'toolchange') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'toolchange') listeners.delete(fn); },
  };

  Object.defineProperty(Document.prototype, 'modelContext', {
    configurable: true,
    get() { return this === document ? modelContext : undefined; },
  });

  /* Test-only introspection. Not part of the API surface Rapier may rely on. */
  window.__webmcp = {
    names: () => Array.from(tools.keys()),
    entry: name => tools.get(name),
    count: () => tools.size,
    call: async (name, input, signal) => {
      const tool = (await modelContext.getTools()).find(candidate => candidate.name === name);
      return modelContext.executeTool(tool, JSON.stringify(input == null ? {} : input), { signal });
    },
    stats: () => ({
      registrations: stats.registrations,
      unregistrations: stats.unregistrations,
      cancelled: stats.cancelled.slice(),
    }),
    resetStats: () => {
      stats.registrations = 0;
      stats.unregistrations = 0;
      stats.cancelled.length = 0;
    },
  };
};
