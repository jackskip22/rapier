// SPDX-License-Identifier: MIT
import {NextResponse} from 'next/server';
import {acceptsJxl} from '../files/accept.mjs';

const fs = typeof EdgeRuntime === 'string' ? null : globalThis.process?.getBuiltinModule?.('node:fs');
const PUBLIC = fs && globalThis.process.cwd() + '/public';

const jxlPath = (url, width) => `/_jxl/w${width}${url}.jxl`;
const LOCAL_IMAGE = /^\/(?!\/)[^?#]*\.(?:jpe?g|png)$/i;

function climbs(path) {
  try {
    for (let segment of path.split('/')) {
      for (let before = ''; before !== segment;) before = segment, segment = decodeURIComponent(segment);
      if (segment === '.' || segment === '..' || segment.includes('\\') || segment.includes('/')) return true;
    }
  } catch { return true; }
  return false;
}

export async function jxlProxy(request) {
  if (request.method && !['GET', 'HEAD'].includes(request.method)) return;
  if (request.headers.has('range')) return;
  const {pathname, searchParams} = request.nextUrl;
  if (pathname !== '/_next/image') return;
  const url = searchParams.get('url') ?? '', width = Number(searchParams.get('w'));
  if (!LOCAL_IMAGE.test(url) || !Number.isInteger(width) || width < 1 || climbs(url)) return;
  if (!acceptsJxl(request.headers.get('accept'), /\.png$/i.test(url) ? 'image/png' : 'image/jpeg')) return;
  const path = jxlPath(url, width);
  if (fs ? !fs.existsSync(PUBLIC + path) : !(await fetch(new URL(path, request.url), {method: 'HEAD'}).then(r => r.ok, () => false))) return;
  const response = NextResponse.rewrite(new URL(path, request.url));
  response.headers.set('Vary', 'Accept');
  return response;
}
