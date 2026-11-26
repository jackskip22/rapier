// SPDX-License-Identifier: MIT
const WITH_JXL = new Set( []);

import {acceptsJxl} from '../files/accept.mjs';

const varied = vary => !vary ? 'Accept' : /(?:^|,)\s*(?:\*|accept)\s*(?:,|$)/i.test(vary) ? vary : `${vary}, Accept`;
function netlifyVaried(vary) {
  if (!vary?.trim()) return 'header=Accept';
  const headers = vary.split(',').map(part => part.trim()).find(part => /^header=/i.test(part));
  if (!headers) return `${vary}, header=Accept`;
  return headers.slice(7).split('|').some(name => name.trim().toLowerCase() === 'accept') ? vary : null;
}

export default async (request, context) => {
  const {pathname} = new URL(request.url);
  if (!WITH_JXL.has(pathname) || !['GET', 'HEAD'].includes(request.method) || request.headers.has('range')) return;
  let response = null;
  if (acceptsJxl(request.headers.get('accept') ?? '', /\.png$/i.test(pathname) ? 'image/png' : 'image/jpeg')) {
    response = await fetch(new URL(pathname.replace(/\.[^./]+$/, '.jxl'), request.url), {method: request.method});
    if (!response.ok || netlifyVaried(response.headers.get('netlify-vary')) === null) response = null;
  }
  const jxl = response !== null;
  response ??= await context.next();
  const netlify = netlifyVaried(response.headers.get('netlify-vary'));
  if (netlify === null) return response;
  const headers = new Headers(response.headers);
  if (jxl) headers.set('Content-Type', 'image/jxl');
  headers.set('Vary', varied(headers.get('vary')));
  headers.set('Netlify-Vary', netlify);
  return new Response(response.body, {status: response.status, headers});
};

export const config = {path: ['/*.jpg', '/*.jpeg', '/*.png', '/*.JPG', '/*.JPEG', '/*.PNG'], cache: 'manual'};
