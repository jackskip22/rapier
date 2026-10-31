// SPDX-License-Identifier: AGPL-3.0-only
const bodyFailure = (code, message, details) => Object.assign(new Error(message), {code, details});

export class JsonDepthGuard {
  constructor(maxDepth, {label = 'JSON request', failure = bodyFailure} = {}) {
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) throw new TypeError('maxDepth must be a positive safe integer');
    this.limit = maxDepth; this.label = label; this.failure = failure;
    this.depth = 0; this.quoted = false; this.escaped = false;
    this.special = /["\\{}\[\]]/g;
  }
  write(text) {
    let at = 0;
    if (this.escaped && text.length) { this.escaped = false; at = 1; }
    this.special.lastIndex = at;
    let match;
    while ((match = this.special.exec(text))) {
      const char = match[0];
      if (this.quoted) {
        if (char === '"') this.quoted = false;
        else if (char === '\\') {
          if (this.special.lastIndex === text.length) this.escaped = true;
          else this.special.lastIndex++;
        }
      } else if (char === '"') this.quoted = true;
      else if (char === '{' || char === '[') {
        if (++this.depth > this.limit) throw this.failure('JSON_TOO_DEEP',
          `The ${this.label} must have at most ${this.limit} nested containers.`, {limitDepth: this.limit});
      } else if (char === '}' || char === ']') this.depth--;
    }
  }
}

