// SPDX-License-Identifier: MIT
const watchers = new Map();
let parts = 0;
export const hasShownWatchers = () => watchers.size !== 0;
export const shown = (bytes, picture, plan) => {
  if (watchers.size && bytes instanceof Uint8Array && picture) for (const [watch, depth] of watchers) if (depth >= parts) watch(bytes, picture, plan);
  return bytes;
};
export const watchShown = watch => { watchers.set(watch, parts); return () => { watchers.delete(watch); }; };
const composedWatchers = new Map();
export const composed = (bytes, shows) => {
  if (composedWatchers.size && bytes instanceof Uint8Array) for (const [watch, depth] of composedWatchers) if (depth >= parts) watch(bytes, shows);
  return bytes;
};
export const watchComposed = watch => { composedWatchers.set(watch, parts); return () => { composedWatchers.delete(watch); }; };
export const EXACT = /* @__PURE__ */ Object.freeze({exact: true});
function* around(steps, enter, leave) {
  let method = 'next', value, done = false;
  try {
    for (;;) {
      let step;
      enter();
      try { step = steps[method](value); } finally { leave(); }
      if (step.done) { done = true; return step.value; }
      try { value = yield step.value; method = 'next'; } catch (error) { value = error; method = 'throw'; }
    }
  } finally {
    if (!done) { enter(); try { steps.return?.(); } finally { leave(); } }
  }
}
export const partsOf = steps => around(steps, () => { parts++; }, () => { parts--; });
export const watchedSteps = (steps, seen, layered) => {
  let stop = [];
  return around(steps, () => { stop = [watchShown(seen), watchComposed(layered)]; }, () => { for (const end of stop) end(); });
};
