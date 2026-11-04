// SPDX-License-Identifier: AGPL-3.0-only
const BROWSERS = [[/\bEdg(?:e|A|iOS)?\//, 'Edge'], [/\b(?:OPR|Opera)\//, 'Opera'], [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'], [/\bCriOS\//, 'Chrome'], [/\b(?:Chrome|Chromium)\//, 'Chrome'], [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari']];
const SYSTEMS = [[/\bAndroid\b/, 'Android'], [/\biPhone\b/, 'iPhone'], [/\biPad\b/, 'iPad'], [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'], [/\bMac OS X\b|\bMacintosh\b/, 'macOS'], [/\bLinux\b/, 'Linux']];
const named = (rows, text) => rows.find(([pattern]) => pattern.test(text))?.[1] || null;

function countryName(code) {
  if (!/^[A-Z]{2}$/.test(code || '') || code === 'XX' || code === 'T1') return null;
  try {
    const name = new Intl.DisplayNames(['en'], {type: 'region'}).of(code);
    if (!name || name === code || /^Unknown\b/.test(name)) return null;
    return /^(?:United|European) |Islands$|^(?:Netherlands|Philippines|Bahamas|Gambia|Maldives|Comoros|Seychelles|Dominican Republic|Central African Republic)$/.test(name) ? 'the ' + name : name;
  } catch { return null; }
}

export function browserWhere(request) {
  const agent = (request.headers.get('User-Agent') || '').slice(0, 512);
  const browser = named(BROWSERS, agent), system = named(SYSTEMS, agent);
  const country = countryName(request.headers.get('CF-IPCountry'));
  const which = (browser || 'Unknown browser') + (system ? ' on ' + system : '');
  return (which + (country ? ', in ' + country : '')).slice(0, 120);
}
