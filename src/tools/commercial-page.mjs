// SPDX-License-Identifier: AGPL-3.0-only
// Public Payment Links are configuration, never credentials. No payment code runs inside Rapier.
export function commercialPage(template, configuration) {
  const keys = ['commercial', 'whiteLabel', 'agreement'];
  if (!configuration || keys.some(key => !(key in configuration)) || Object.keys(configuration).some(key => !keys.includes(key)))
    throw new Error('Commercial checkout requires commercial, whiteLabel and agreement URLs.');
  const present = keys.filter(key => configuration[key] !== null);
  if (present.length && present.length !== keys.length)
    throw new Error('Connect both purchase links and the accepted agreement together.');
  const urls = {};
  for (const key of present) {
    const value = configuration[key];
    if (typeof value !== 'string') throw new Error('Commercial checkout URLs must be strings.');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      (key === 'agreement' ? url.hostname !== 'rapier.website' : url.hostname !== 'buy.stripe.com'))
      throw new Error('Use the public Rapier agreement and Stripe Payment Links.');
    urls[key] = url.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  }
  const purchase = (key, label) => urls[key]
    ? `<a class="purchase" href="${urls[key]}" rel="noopener noreferrer">${label}</a>`
    : '<span class="soon">Purchasing opens soon</span>';
  return template.replace('<!-- COMMERCIAL_CHECKOUT -->', purchase('commercial', 'Buy commercial licence'))
    .replace('<!-- WHITELABEL_CHECKOUT -->', purchase('whiteLabel', 'Buy white-label licence'))
    .replace('<!-- AGREEMENT_LINK -->', urls.agreement ? `<p><a href="${urls.agreement}">Read the full agreement</a></p>` : '');
}
