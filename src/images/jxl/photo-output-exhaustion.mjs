// SPDX-License-Identifier: MIT
const exhaustedOutputs = new WeakSet();
export const photoOutputExhausted = error => exhaustedOutputs.has(error);
