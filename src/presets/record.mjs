// SPDX-License-Identifier: AGPL-3.0-only
export const PRESET_BYTES = 4 * 1024 * 1024;
export const PRESET_LIMIT = 128;
export const PRESET_SETTINGS = Object.freeze(['mainfont', 'sansfont', 'monofont', 'defaultfont', 'fontsize', 'linestretch']);
const fail = () => { throw new Error('This is not a readable starter (version 1, at most 4 MiB).'); };
const object = value => value && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
export function presetName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80 || /[\x00-\x1f\x7f/\\<>:"|?*]/.test(value) || /^\.+$/.test(value.trim())) fail();
  return value.trim();
}
export function admitPreset(value) {
  if (!keys(value, ['version', 'id', 'name', 'content', 'presentation']) || value.version !== 1 ||
      !/^p[a-f0-9]{24}$/.test(value.id) || !value.content && !value.presentation) fail();
  const out = {version: 1, id: value.id, name: presetName(value.name)};
  if (value.content !== undefined) {
    if (!keys(value.content, ['scope', 'text']) || !['document', 'selection'].includes(value.content.scope) ||
        typeof value.content.text !== 'string' || value.content.text.length > PRESET_BYTES) fail();
    out.content = {scope: value.content.scope, text: value.content.text};
  }
  if (value.presentation !== undefined) {
    const p = value.presentation;
    if (!keys(p, ['settings', 'fonts']) || !keys(p.settings, PRESET_SETTINGS) || typeof p.fonts !== 'string' || p.fonts.length > PRESET_BYTES) fail();
    for (const setting of Object.values(p.settings)) if (setting !== null && (typeof setting !== 'string' || setting.length > 160 || /[\x00-\x1f\x7f]/.test(setting))) fail();
    out.presentation = {settings: {...p.settings}, fonts: p.fonts};
  }
  if (new TextEncoder().encode(JSON.stringify(out)).length > PRESET_BYTES) fail();
  return out;
}
