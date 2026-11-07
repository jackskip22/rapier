import {env} from 'cloudflare:workers';
import {createStorage as createR2} from '@emdash-cms/cloudflare/storage/r2';
import {withMediaCopies, registerStorage} from './media-storage.mjs';
import {r2Store} from './r2-store.mjs';

export function createStorage(config) {
  const inner = createR2(config), bucket = env[config.binding];
  const limits = {maxPixels: 24e6, maxInputBytes: 32 * 1024 * 1024, ...config.rapier};
  const {store, create} = r2Store(inner, bucket);
  return registerStorage(withMediaCopies(store, {...limits, create}), JSON.stringify(['r2', config.binding]));
}
