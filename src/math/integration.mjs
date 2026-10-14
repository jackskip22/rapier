// SPDX-License-Identifier: MIT
import {render} from './index.mjs';
import {renderAccessible} from './accessible.mjs';
import {mathDiagnostic} from '../src/math/source.js';
import {assertMathSession, reuseFormula} from './reuse.mjs';

export const escapeText = text => text.replace(/[&<>"'\r]/g, char =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\r': '&#13;'}[char]));

function dataOptions(value, allowed, order) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object') return null;
  let fields;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
  } catch { return null; } // Prototype inspection is optional.
  try { fields = Object.getOwnPropertyDescriptors(value); }
  catch (error) {
    if (!order) throw error; // Top-level spread would enumerate these fields.
    return null; // Core screen access does not enumerate.
  }
  for (const key of Reflect.ownKeys(fields)) {
    const field = fields[key];
    if (!allowed.includes(key) || !field.enumerable || !('value' in field)) return null;
  }
  const output = {};
  // Descriptor values need not equal Get values on a Proxy. Read each admitted
  // property once and render exactly that captured value; derive the key from it.
  // Actual Get failures propagate, rather than being silently retried as inspection.
  for (const key of order || Reflect.ownKeys(fields)) output[key] = value[key];
  return output;
}

// A root captures plain-data options once, including any invalid acquired value.
// The key is a fixed tuple of finite numbers/booleans, followed by exact source.
// Structural unknown/accessor shapes bypass without evaluating their getters for
// a key. Proxies that disclose a data shape render their actual captured values.
function configuration(input) {
  let options;
  try { options = dataOptions(input, ['displayMode', 'maxWidth', 'screen']); }
  catch (error) { return {key: null, error}; }
  if (!options) return {options: input, key: null};
  let cacheable = (options.displayMode === undefined || typeof options.displayMode === 'boolean') &&
    (options.maxWidth === undefined || Number.isFinite(options.maxWidth));
  let screenKey = '-';
  if (options.screen !== undefined) {
    let screen;
    try { screen = dataOptions(options.screen, ['fontSize', 'pixelRatio', 'dark'], ['fontSize', 'pixelRatio', 'dark']); }
    catch (error) {
      // Screen access belongs inside the core's source/diagnostic admission. Keep
      // that ordering, including when source itself is refused before screen use.
      options.screen = Object.freeze({get fontSize() { throw error; }});
      return {options: Object.freeze(options), key: null};
    }
    if (!screen) cacheable = false;
    else {
      options.screen = Object.freeze(screen);
      cacheable &&= Number.isFinite(screen.fontSize) && Number.isFinite(screen.pixelRatio) && typeof screen.dark === 'boolean';
      if (cacheable) screenKey = screen.fontSize + '|' + screen.pixelRatio + '|' + Number(screen.dark);
    }
  }
  return {options: Object.freeze(options), key: cacheable ? (options.maxWidth === undefined ? '-' : options.maxWidth) + '|' + screenKey : null};
}

function failure(message) {
  return {errors: [{code: 'resource-limit', offset: 0, message}]};
}

// One insertion boundary preserves the renderer payload and supplies the complete
// markup consumed by both adapters. Admission is charged after materialization.
function materialize(result) {
  return {...result, markup: result.html ?? result.svg};
}

// One budget per document render, never per env/session/parser instance.
export function createFormulaRenderer(options = {}, session) {
  assertMathSession(session);
  const maxFormulas = options.maxFormulas ?? 1024, maxOutputLength = options.maxOutputLength ?? 16 * 1024 * 1024;
  for (const value of [maxFormulas, maxOutputLength])
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Math integration budgets must be finite nonnegative integers.');
  const accessible = !!options.accessible;
  const captured = session === undefined ? null : configuration(options.renderOptions);
  let count = 0, length = 0;
  return (source, displayMode, inLink = false) => {
    assertMathSession(session);
    if (count >= maxFormulas || length >= maxOutputLength) return failure('The document math budget is exhausted.');
    count++;
    let result;
    try {
      result = reuseFormula(session, source, captured?.key == null ? null : Number(accessible) + '|' + Number(!!displayMode) + '|' + captured.key,
        () => {
          if (captured && Object.hasOwn(captured, 'error')) throw captured.error;
          const renderOptions = {...(captured ? captured.options : options.renderOptions), displayMode};
          if (!accessible) return render(source, renderOptions);
          const {semantics, ...artifact} = renderAccessible(source, renderOptions);
          return artifact;
        });
    } catch (error) { return {errors: [mathDiagnostic(error)]}; }
    if (result.errors.length) return {errors: result.errors.map(error => ({...error}))};
    const output = materialize(result);
    if (inLink && /<a\s/.test(output.markup)) return {errors: [{code: 'nested-link', offset: 0,
      message: 'A formula inside a link cannot contain another authored link.'}]};
    if (output.markup.length > maxOutputLength - length) {
      length = maxOutputLength;
      return failure('The document math output budget is exhausted.');
    }
    length += output.markup.length;
    return output;
  };
}
