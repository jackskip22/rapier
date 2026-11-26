import {createBoundCodec} from './codec-bound.mjs';
import {MODULES} from './codec-modules.mjs';
import {fail} from './primitives.mjs';
import {entryKey, shownEntry} from './entry-name.mjs';
import './preparation-jpeg.mjs';

export function createCodec(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw fail('JXL_OPTIONS', "codec config: object");
  const {module, ...rest} = config;
  const name = entryKey(module), spec = Object.hasOwn(MODULES, name) ? MODULES[name] : null;
  if (!spec) throw fail('JXL_OPTIONS', 'codec module: ' + Object.keys(MODULES).map(shownEntry).join(', '));
  return createBoundCodec(rest, spec);
}
