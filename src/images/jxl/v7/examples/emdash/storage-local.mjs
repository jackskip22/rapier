import {createStorage as createLocal} from 'emdash/storage/local';
import {resolve} from 'node:path';
import {withMediaCopies, registerStorage} from './media-storage.mjs';
import {localStore} from './local-store.mjs';

export function createStorage(config) {
  const limits = {maxPixels: 40e6, maxInputBytes: 256 * 1024 * 1024, ...config.rapier};
  const {store, create} = localStore(createLocal(config), config.directory, limits.maxInputBytes);
  return registerStorage(withMediaCopies(store, {...limits, create}), JSON.stringify(['local', resolve(config.directory)]));
}
