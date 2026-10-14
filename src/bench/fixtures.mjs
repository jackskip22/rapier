// SPDX-License-Identifier: AGPL-3.0-only
export const DOCUMENT_FIXTURES = Object.freeze([
  {
    "id": "handbook-1mb",
    "kind": "handbook",
    "mb": 1,
    "bytes": 1000000,
    "seed": 43009,
    "sha256": "04f790a97dd4572461158a0201aa8ef14582015c95672a1d6179b0a428c0215f",
    "lines": 15167,
    "rare": "zqx01end",
    "provenance": "Original deterministic synthetic scenario; not a collected real-world document.",
    "pictures": 0
  },
  {
    "id": "api-10mb",
    "kind": "api",
    "mb": 10,
    "bytes": 10000000,
    "seed": 43220,
    "sha256": "fc9f086ae333f5bdd272c0748e88af4a93c8fc48d1f89a6feeee502f185268d9",
    "lines": 264521,
    "rare": "zqx210end",
    "provenance": "Original deterministic synthetic scenario; not a collected real-world document.",
    "pictures": 0
  },
  {
    "id": "code-24mb",
    "kind": "code",
    "mb": 24,
    "bytes": 24000000,
    "seed": 43537,
    "sha256": "cbe02d3831eb1bc647e4634c0cc594061a59e1c04378c057df00fdbe401c8406",
    "lines": 100308,
    "rare": "zqx524end",
    "provenance": "Original deterministic synthetic scenario; not a collected real-world document.",
    "pictures": 0
  }
].map(Object.freeze));
const nouns = ['harbour', 'orchard', 'reservoir', 'workshop', 'station', 'archive', 'bridge', 'garden', 'observatory', 'quarry', 'market', 'canal'];
const roles = ['keeper', 'surveyor', 'carpenter', 'planner', 'reader', 'courier', 'navigator', 'engineer'];
const issues = ['drainage', 'handover', 'storage', 'alignment', 'access', 'inspection', 'weather', 'supply'];
function random(seed) { let n = seed >>> 0; return () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) / 4294967296; }; }
function prose(rng, index) {
 const pick = a => a[Math.floor(rng() * a.length)], n = pick(nouns), role = pick(roles), issue = pick(issues), a = 2 + Math.floor(rng() * 197), b = 1 + Math.floor(rng() * 31);
 return [
  `At the ${n}, the ${role} recorded ${a} observations before changing the ${issue} plan. The original notebook stayed beside the working copy so another person could reconstruct the decision.`,
  `Inspection ${index} began after ${b} days of rain. A missing measurement mattered more than a neat average: the ${role} marked the gap and delayed work on the ${n} until a second reading arrived.`,
  `The ${issue} ledger assigns ${a} units to the ${n}. Reserve ${b} for repairs, report each transfer, and compare the balance with the physical stock before closing the shift.`,
  `A visitor asked why the ${n} needed a separate ${issue} record. The ${role} explained that a promise and a completed job are different facts; both belong in the book, with dates and a named owner.`,
  `Trial ${index} used ${b} samples from the ${n}. The ${role} kept the outliers because they described actual conditions, then wrote a short account of the instrument and its ${a}-unit range.`,
  `Work resumed at the ${n} when the ${issue} review ended. Of ${a} proposed changes, ${b} received a field trial; the remaining proposals stayed in the archive with the reasons for postponement.`,
 ][Math.floor(rng() * 6)];
}
function block(kind, index, rng) {
 const p = () => prose(rng, index), topic = nouns[index % nouns.length];
 switch (kind) {
 case 'handbook': return `\n## Chapter ${index}: ${topic} records\n\n${p()}\n\n${p()}\n\n${index % 3 ? `> Field note ${index}: ${p()}` : `1. Record the measurement.\n2. Ask another reader to check it.\n   - Keep the original notes.\n   - Name the unresolved question.`}\n\n${index % 5 ? p() : `| Phase | Owner | Record |\n| --- | --- | --- |\n| Survey | ${roles[index % 8]} | ${index} |\n\nA measured value of **${index + 17}** remains provisional. See [the procedure](#chapter-${Math.max(0,index-1)}).`}\n`;
 case 'api': return `\n## ${topic}.inspect${index}(request)\n\n${p()}\n\n| Parameter | Type | Required | Meaning |\n| --- | --- | --- | --- |\n| cursor | string | no | Resume record ${index} |\n| limit | integer | yes | Range 1 to ${index + 20} |\n\n### Response\n\n\`\`\`json\n{"id": ${index}, "status": "${index % 2 ? 'pending' : 'complete'}", "records": [${index},${index+1}], "next": "page-${index+1}"}\n\`\`\`\n\n### Failure and retry\n\n${p()}\n\n- **409**: revision changed; read again before applying a write.\n- **422**: the supplied limit is outside the documented range.\n`;
 case 'code': { let s = `\n## Batch ${index}\n\n${p()}\n\n\`\`\`javascript\n// Original generated inventory records, batch ${index}.\nconst batch${index} = [\n`; for(let j=0;j<320;j++) s += `  {id: ${index*320+j}, site: "${nouns[j%12]}", quantity: ${Math.floor(rng()*10000)}, note: ${JSON.stringify(p())}},\n`; return s + `];\nconst total${index} = batch${index}.reduce((sum, row) => sum + row.quantity, 0);\n\`\`\`\n`; }
 default: throw new Error(kind);
 }
}
function padAscii(rng, length) { let out = ''; while(out.length < length) out += prose(rng, out.length) + ' '; return out.slice(0,length); }
export function generateDocumentFixture(id) {
 const metadata = DOCUMENT_FIXTURES.find(fixture => fixture.id === id);
 if (!metadata) throw new Error('Unknown document fixture: ' + id);
 const {kind, mb, bytes, seed, rare} = metadata, rng = random(seed);
 let source = `# A8 ${kind} ${mb} MB\n\nOriginal generated scenario; no external source material.\n\n- Opening checklist item\n- Keep this second item\n\n`;
 const footer = `\n\n- Closing checklist item\n- Keep the final item\n\n${rare}\n`;
 let index = 0;
 for (;;) {
  const part = block(kind, index++, rng);
  if (source.length + part.length + footer.length + 30 > bytes) break;
  source += part;
 }
 const reserve = bytes - source.length - footer.length;
 source += '\n\n' + padAscii(rng, reserve - 2) + footer;
 if (source.length !== bytes) throw new Error('Document fixture byte size mismatch');
 return {source, metadata};
}
