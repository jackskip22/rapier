// SPDX-License-Identifier: MIT
import {access, mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {join, sep} from 'node:path';
import {IMAGE, jxlFiles, jxlName} from '../files/index.mjs';

const EDGE = 'rapier-jxl.mjs';

export const onBuild = async ({constants, inputs = {}, utils}) => {
  const publish = constants.PUBLISH_DIR;
  const effort = inputs.effort === undefined ? 3 : Number(inputs.effort);
  const fidelity = String(inputs.exact) === 'true' ? 'exact' : inputs.quality === undefined ? undefined : {quality: Number(inputs.quality)};
  const cacheDir = join(constants.CACHE_DIR ?? '.netlify/cache', 'rapier-jxl');
  if (utils?.cache) await utils.cache.restore(cacheDir);
  const {toJxl} = jxlFiles({fidelity, effort, cacheDir});
  let names;
  try { names = await readdir(publish, {recursive: true}); }
  catch { return utils.build.failPlugin(`rapier-jxl: the publish folder ${publish} does not exist. Fix: set build.publish in netlify.toml to the folder your build writes.`); }
  const paths = [], taken = new Set(), started = performance.now();
  let bytesIn = 0, bytesOut = 0, left = 0;
  for (const name of names.filter(n => IMAGE.test(n)).sort()) {
    const file = join(publish, name), to = jxlName(file);
    if (taken.has(to)) { left++; continue; }
    taken.add(to);
    const path = '/' + name.split(sep).map(encodeURIComponent).join('/');
    if (await access(to).then(() => true, () => false)) { paths.push(path); continue; }
    try {
      const {bytes} = await toJxl(file);
      await writeFile(to, bytes);
      bytesIn += (await stat(file)).size; bytesOut += bytes.length;
      paths.push(path);
    } catch (error) {
      left++;
      console.log(`rapier-jxl left ${name} as it is: ${error.code || ''} ${error.message}`);
    }
  }
  const edgeDir = constants.INTERNAL_EDGE_FUNCTIONS_SRC;
  await mkdir(edgeDir, {recursive: true});
  const template = await readFile(new URL('./edge.mjs', import.meta.url), 'utf8');
  const accept = await readFile(new URL('../files/accept.mjs', import.meta.url), 'utf8');
  const edge = template.replace("import {acceptsJxl} from '../files/accept.mjs';", () => accept.replace(/^export /gm, ''));
  await writeFile(join(edgeDir, EDGE), edge.replace('/* paths */[]', JSON.stringify(paths)));
  if (utils?.cache) await utils.cache.save(cacheDir);
  const summary = `${paths.length} pictures have a JPEG XL copy, ${bytesIn} bytes to ${bytesOut} (${Math.round(performance.now() - started)} ms)${left ? `; ${left} left as they are` : ''}`;
  console.log('rapier-jxl: ' + summary);
  utils?.status?.show({title: 'rapier-jxl', summary});
};
