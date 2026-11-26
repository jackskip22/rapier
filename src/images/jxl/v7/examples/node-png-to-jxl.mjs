import {readFile, writeFile} from 'node:fs/promises';
import {encode} from 'rapier-jxl/upload';

const [from = 'photo.png', to = 'photo.jxl'] = process.argv.slice(2);
const result = await encode(new Blob([await readFile(from)]), {fidelity: {quality: 82}});
await writeFile(to, result.bytes);
console.log(`${from} -> ${to}: ${result.bytes.length} bytes, ${result.width}x${result.height}`);
