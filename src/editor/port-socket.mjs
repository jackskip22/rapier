// SPDX-License-Identifier: AGPL-3.0-only
export function portSocket(post) {
  const open = new Map();
  let sequence = 0;
  class PortSocket {
    constructor(url, protocols) {
      this.readyState = 0; this.id = ++sequence;
      open.set(this.id, this);
      post({type: 'socket', op: 'open', id: this.id, url, protocols});
    }
    send(data) { if (this.readyState === 1) post({type: 'socket', op: 'send', id: this.id, data}); }
    close(code = 1000, reason = '') {
      if (this.readyState === 3) return;
      this.readyState = 3; open.delete(this.id);
      post({type: 'socket', op: 'close', id: this.id, code, reason});
    }
  }
  PortSocket.receive = value => {
    const socket = open.get(value.id);
    if (!socket) return;
    if (value.event === 'open') { socket.readyState = 1; socket.onopen?.({}); }
    else if (value.event === 'message') socket.onmessage?.({data: value.data});
    else if (value.event === 'error') socket.onerror?.({});
    else if (value.event === 'close') { socket.readyState = 3; open.delete(value.id); socket.onclose?.({code: value.code, reason: value.reason}); }
  };
  return PortSocket;
}
