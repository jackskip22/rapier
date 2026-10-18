// SPDX-License-Identifier: AGPL-3.0-only
import field from '../draw/letters/field.json' with {type: 'json'};
import relief from '../draw/letters/relief.json' with {type: 'json'};
import leaf from '../draw/letters/leaf.json' with {type: 'json'};
import arabesque from '../draw/letters/arabesque.json' with {type: 'json'};
import silhouette from '../draw/letters/silhouette.json' with {type: 'json'};
import gothic from '../draw/letters/gothic.json' with {type: 'json'};
import sugar from '../draw/letters/sugar.json' with {type: 'json'};
import illuminated1490 from '../draw/letters/illuminated-1490.json' with {type: 'json'};
import tuscan1845 from '../draw/letters/tuscan-1845.json' with {type: 'json'};
import renaissanceAlphabet from '../draw/letters/renaissance-alphabet.json' with {type: 'json'};
import {LETTER_SETS, admitLetterSet, holdLetterSet} from '../draw/letters.mjs';

let ready;
const unavailable = () => Object.assign(new Error('The letter resources are invalid. Rebuild the door with its pinned letter sets.'), {code: 'DRAW_RESOURCES_UNAVAILABLE'});

export function prepareDoorLetters() {
  return ready ||= (async () => {
    const sources = new Map([field, relief, leaf, arabesque, silhouette, gothic, sugar, illuminated1490, tuscan1845, renaissanceAlphabet].map(raw => [raw.id, raw]));
    if (sources.size !== LETTER_SETS.length) throw unavailable();
    const sets = await Promise.all(LETTER_SETS.map(async pin => {
      const raw = sources.get(pin.id), admitted = admitLetterSet(raw);
      if (!admitted) throw unavailable();
      const bytes = new TextEncoder().encode(JSON.stringify(raw));
      if (bytes.length !== pin.bytes) throw unavailable();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', bytes));
      if (btoa(String.fromCharCode(...digest)) !== pin.sha384) throw unavailable();
      return admitted;
    }));
    for (const set of sets) if (!holdLetterSet(set)) throw unavailable();
  })();
}
