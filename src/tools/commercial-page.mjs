// SPDX-License-Identifier: AGPL-3.0-only
// The commercial page's checkout slots (rapier.website/commercial: the sheet in editor/ui.html). Public Payment Links are
// configuration, never credentials. No payment code runs inside Rapier: a checkout is one plain https link, because the page's policy
// allows no script, frame or form for a payment provider. The build calls this on the interface markup before it is packed, with
// commercial-checkout.json; nothing here runs in the page.
export function commercialPage(markup, configuration) {
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
  // The sheet's own classes (editor/styles/rapier-source.css, the licences sheet's): a link opens in a new tab, as the licences sheet's does.
  const purchase = (key, label) => urls[key]
    ? `<a class="licenses-link" href="${urls[key]}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : '';
  const slots = [
    ['<!-- COMMERCIAL_CHECKOUT -->', purchase('commercial', 'Buy commercial licence')],
    ['<!-- WHITELABEL_CHECKOUT -->', purchase('whiteLabel', 'Buy white-label licence')],
    ['<!-- AGREEMENT_LINK -->', urls.agreement
      ? `<div class="licenses-links"><a class="licenses-link" href="${urls.agreement}" target="_blank" rel="noopener noreferrer">Read the full agreement</a></div>` : ''],
  ];
  let out = markup;
  for (const [slot, text] of slots) {
    if (out.split(slot).length !== 2) throw new Error('The commercial sheet must carry ' + slot + ' exactly once.');
    out = out.replace(slot, () => text);
  }
  return out;
}
