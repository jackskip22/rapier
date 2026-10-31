// SPDX-License-Identifier: AGPL-3.0-only
export const MAX_PUBLISHED_PAGE_BYTES = 16 * 1024 * 1024;

export const isPublicationId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isPublicationSecret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);

export async function publicationId(secret) {
  if (!isPublicationSecret(secret)) throw new TypeError('Invalid publication key.');
  const bytes = new TextEncoder().encode('rapier-publish-v1:' + secret);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function publicationSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function publicationOrigin(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new TypeError('Publishing needs an HTTPS origin.');
  return url.origin;
}

export function publicPageUrl(origin, id) {
  if (!isPublicationId(id)) throw new TypeError('Invalid publication address.');
  return publicationOrigin(origin) + '/p/' + id;
}
