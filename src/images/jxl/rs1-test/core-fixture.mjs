// SPDX-License-Identifier: MIT
import {createStepper} from '../resumable-encode.mjs';
export const BUILD = '1'.repeat(64);
export const adapter = (observe = () => {}, build = BUILD) => ({
  id: 'transport-test', build,
  normalize(options, source) {
    if (source.byteLength < 1) throw new Error('Empty test source.');
    return {options: {mask: options.mask ?? 37}};
  },
  start(plan, source) { return {at: 0, length: source.byteLength, mask: plan.options.mask, parts: []}; },
  async step(state, io) {
    observe(state.at);
    const bytes = await io.readSource(state.at, Math.min(3073, state.length - state.at));
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= state.mask;
    const ref = await io.write(bytes), next = {...state, at: state.at + bytes.length, parts: [...state.parts, ref]};
    if (next.at < next.length) return {state: next, work: {phase: 'transform', bytes: bytes.length}};
    const out = new Uint8Array(next.length);
    let at = 0;
    for (const part of next.parts) { const b = await io.read(part); out.set(b, at); at += b.length; }
    return {state: next, output: out, result: {length: out.length}, work: {phase: 'transform', bytes: bytes.length}};
  }
});
export const stepper = observe => createStepper(adapter(observe));
