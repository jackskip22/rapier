// SPDX-License-Identifier: AGPL-3.0-only
import {PageDoor, validHandover} from '../mcp/page-door.mjs';
import {CUSTODY_PROTOCOL} from '../mcp/custody-wire.mjs';
import {checkpointOf, createCheckpointSchedule} from '../agent/checkpoint.mjs';

export function custodySocket(RealSocket, {store, key, rules, host = {}, events = {}, clock = () => Date.now(), tickMs = 60000, handbackBytes}) {
  return class CustodySocket {
    constructor(url, protocols) {
      this.readyState = 0;
      this.mode = 'claiming';
      this.door = null; this.local = null;
      const real = this.real = new RealSocket(url, protocols);
      real.onopen = async () => {
        if (!rules) { this.mode = 'plain'; return this.open(); }
        let held = null;
        try { held = await store.read(); } catch (_) {}
        this.held = validHandover(held) ? held : null;
        real.send(JSON.stringify({type: 'custody', protocol: CUSTODY_PROTOCOL, key, held: !!this.held,
          rev: this.held?.state.revision ?? 0, hash: this.held?.hash ?? '0'.repeat(64)}));
      };
      real.onmessage = event => { void this.fromObject(event); };
      real.onerror = event => this.onerror?.(event);
      real.onclose = event => {
        this.readyState = 3;
        this.stopCheckpoints?.();
        this.local?.close(1000, 'left');
        if (event.code === 4001) void store.clear?.();
        this.onclose?.(event);
      };
    }

    open() { this.readyState = 1; this.onopen?.({}); }

    async attach(custody) {
      this.door = new PageDoor({handover: custody, rules, host, save: value => store.write(value), handbackBytes,
        oversize: () => { if (this.mode === 'custody') void this.release(); }});
      this.local = this.door.connect();
      this.local.listeners.add(data => this.onmessage?.({data}));
      this.mode = 'custody';
      try { await store.write(this.door.custody()); }
      catch (_) { await this.release(); return; }
      this.checkpoints();
      this.open();
    }

    checkpoints() {
      let written = this.door.state.revision;
      this.schedule = createCheckpointSchedule({clock, linked: () => this.mode === 'custody' && this.real.readyState === 1,
        write: () => {
          const state = this.door.state;
          written = state.revision;
          this.real.send(JSON.stringify({type: 'checkpoint', ...checkpointOf({text: state.text, revision: state.revision, filename: state.filename})}));
        }});
      const changed = () => { if (this.door.state.revision !== written) this.schedule.changed(); };
      const hidden = event => {
        if (event?.type === 'pagehide' && event.persisted !== true) { this.releaseNow(); return; }
        if (event?.type === 'visibilitychange' && events.document?.visibilityState !== 'hidden') return;
        changed(); void this.schedule.pagehide();
      };
      this.timer = setInterval(() => { changed(); void this.schedule.tick(); }, tickMs);
      this.timer.unref?.();
      events.addEventListener?.('pagehide', hidden);
      events.addEventListener?.('visibilitychange', hidden);
      this.stopCheckpoints = () => { clearInterval(this.timer); events.removeEventListener?.('pagehide', hidden); events.removeEventListener?.('visibilitychange', hidden); };
    }

    async fromObject(event) {
      if (this.mode === 'plain') return this.onmessage?.(event);
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (this.mode === 'claiming' && message.type === 'custody') {
        if (validHandover(message.handover)) return this.attach(message.handover);
        if (message.resumed === true && this.held) return this.attach(this.held);
        this.mode = 'plain';
        return this.open();
      }
      if (this.mode !== 'custody') return;
      if (message.type === 'turn') {
        const ack = await this.door.turn(message).catch(() => ({refused: 'editor_unavailable'}));
        this.real.send(JSON.stringify({type: 'ack', turn: message.turn, ...ack}));
      } else if (message.type === 'recall') {
        await this.release();
      }
    }

    async release() {
      this.mode = 'released';
      await this.door.pending;
      try { this.real.send(JSON.stringify({type: 'release', custody: this.door.custody()})); } catch (_) {}
    }

    detachClient() { this.local?.close(1000, 'renamed'); this.local = null; }
    attachClient() {
      this.local = this.door.connect();
      this.local.listeners.add(data => this.onmessage?.({data}));
      this.open();
    }

    releaseNow() {
      if (this.mode !== 'custody' || this.real.readyState !== 1) return;
      this.mode = 'released';
      try { this.real.send(JSON.stringify({type: 'release', custody: this.door.custody()})); } catch (_) {}
    }

    context(args) { return this.mode === 'custody' ? this.door.context(args) : null; }
    sync(args) { return this.mode === 'custody' ? this.door.sync(args) : null; }

    send(data) {
      if (this.mode === 'custody') return this.local.send(data);
      if (this.mode === 'released') return;
      return this.real.send(data);
    }

    close(code = 1000, reason = '') {
      const closing = () => { try { this.real.close(code, reason); } catch (_) {} };
      if (this.mode === 'custody' && this.real.readyState === 1) return void this.release().then(closing, closing);
      closing();
    }
  };
}
