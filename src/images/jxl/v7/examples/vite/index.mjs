// SPDX-License-Identifier: MIT
import {createHash} from 'node:crypto';
import {access, mkdir, readFile, readdir, realpath, writeFile} from 'node:fs/promises';
import {basename, dirname, join, relative, resolve, sep} from 'node:path';
import {IMAGE, jxlFiles, jxlName} from '../files/index.mjs';

const QUERY = /[?&]jxl(?:&|$)/, DEV = '/@rapier-jxl/';
function widthsOf(id) {
  const value = new URLSearchParams(id.slice(id.indexOf('?') + 1)).get('w');
  if (value === null) return [undefined];
  const widths = value.split(';').map(Number);
  if (!widths.length || widths.some(w => !Number.isInteger(w) || w < 1 || w > 65535) || new Set(widths).size !== widths.length) return null;
  return widths;
}

export function jxl(options = {}) {
  const {fidelity, effort = 3, folder = [], read, cache = true} = options;
  const folders = [folder].flat();
  let config, toJxl;
  const setup = () => config ??= {root: process.cwd(), command: 'build', cacheDir: join(process.cwd(), 'node_modules', '.cache'), outside: true};
  const dev = new Map();

  const fail = (ctx, file, error) => ctx.error(`rapier-jxl could not write ${relative(config.root, file)}: ${error.code || ''} ${error.message} Fix: import it without ?jxl, or leave it out of the folder, to serve the original.`);
  const withinDir = (dir, file) => (file + sep).startsWith(dir + sep);
  const inFolder = file => folders.some(f => withinDir(resolve(config.root, f), file)) && IMAGE.test(file);
  async function realInsideFolder(file) {
    if (!inFolder(file)) return false;
    const real = await realpath(file).catch(() => null);
    if (!real) return false;
    const roots = await Promise.all(folders.map(f => realpath(resolve(config.root, f)).catch(() => resolve(config.root, f))));
    return roots.some(r => withinDir(r, real));
  }
  async function besideSource(path) {
    for (const root of [config.root, config.publicDir].filter(Boolean))
      for (const ext of ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']) {
        const file = join(root, path.slice(0, -4) + ext);
        if (await access(file).then(() => true, () => false) && await realInsideFolder(file)) return file;
      }
  }

  return {
    name: 'rapier-jxl',
    enforce: 'pre',
    configResolved(resolved) { config = resolved; },
    buildStart() {
      setup();
      toJxl ??= jxlFiles({fidelity, effort, read, cacheDir: cache ? join(config.cacheDir, 'rapier-jxl') : undefined}).toJxl;
    },
    async load(id) {
      if (!QUERY.test(id)) return;
      const file = id.slice(0, id.indexOf('?'));
      if (!IMAGE.test(file)) return;
      const widths = widthsOf(id);
      if (!widths) return this.error(`rapier-jxl: ${id.slice(id.indexOf('?'))} asks for widths it cannot read. Fix: ?w=640&jxl or ?w=480;960&jxl.`);
      this.addWatchFile(file);
      const original = `export {default as original} from ${JSON.stringify(file)};`;
      const list = urls => widths.length === 1 ? urls[0] : urls.map((url, i) => `${url} ${widths[i]}w`).join(', ');
      if (config.command === 'serve') {
        const urls = widths.map(width => {
          const url = DEV + createHash('sha256').update(file + (width ?? '')).digest('hex').slice(0, 16) + '/' + jxlName(basename(file));
          dev.set(url, {file, width});
          return config.base.replace(/\/$/, '') + url;
        });
        return `export default ${JSON.stringify(list(urls))};\n${original}`;
      }
      const refs = [];
      for (const width of widths) {
        let out;
        try { out = await toJxl(file, {width}); } catch (error) { fail(this, file, error); return null; }
        if (!out) return null;
        const name = jxlName(basename(file)).replace(/\.jxl$/, width === undefined ? '.jxl' : `-${width}w.jxl`);
        refs.push(this.emitFile({type: 'asset', name, originalFileName: relative(config.root, file).split(sep).join('/'), source: out.bytes}));
      }
      const urls = refs.map(ref => config.outside ? `" + import.meta.ROLLUP_FILE_URL_${ref} + "` : `__VITE_ASSET__${ref}__`);
      if (!config.outside) return `export default "${list(urls)}";\n${original}`;
      const source = this.emitFile({type: 'asset', name: basename(file), originalFileName: relative(config.root, file).split(sep).join('/'), source: await readFile(file)});
      return `export default "${list(urls)}";\nexport const original = import.meta.ROLLUP_FILE_URL_${source};`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const raw = (req.url || '').split('?')[0], base = config.base.endsWith('/') ? config.base : config.base + '/';
        if (!raw.startsWith(base)) return next();
        let path;
        try { path = decodeURIComponent('/' + raw.slice(base.length)); } catch { return next(); }
        let {file, width} = dev.get(path) ?? {};
        if (!file && path.endsWith('.jxl') && folders.length) file = await besideSource(path);
        if (!file) return next();
        try {
          const {bytes, key} = await toJxl(file, {width});
          res.setHeader('Content-Type', 'image/jxl');
          res.setHeader('ETag', '"' + key.slice(0, 32) + '"');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(bytes);
        } catch (error) {
          server.config.logger.error(`rapier-jxl could not write ${relative(config.root, file)}: ${error.code || ''} ${error.message}`);
          res.statusCode = 500; res.end();
        }
      });
    },
    async generateBundle(_, bundle) {
      if (!folders.length) return;
      const jobs = [];
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset') continue;
        for (const name of asset.originalFileNames || []) {
          const file = resolve(config.root, name);
          if (!inFolder(file)) continue;
          jobs.push(toJxl(file).then(out => this.emitFile({type: 'asset', fileName: jxlName(asset.fileName), source: out.bytes}),
            error => this.warn(`rapier-jxl left ${name} as it is: ${error.code || ''} ${error.message}`)));
          break;
        }
      }
      await Promise.all(jobs);
    },
    async writeBundle() {
      if (!folders.length || !config.publicDir || !config.build.copyPublicDir) return;
      const out = resolve(config.root, config.build.outDir);
      for (const f of folders.map(f => resolve(config.root, f)).filter(f => (f + sep).startsWith(config.publicDir + sep))) {
        let names;
        try { names = await readdir(f, {recursive: true}); } catch { continue; }
        for (const name of names.filter(n => IMAGE.test(n))) {
          const file = join(f, name), to = join(out, relative(config.publicDir, jxlName(file)));
          if (!await realInsideFolder(file)) continue;
          try { const {bytes} = await toJxl(file); await mkdir(dirname(to), {recursive: true}); await writeFile(to, bytes); }
          catch (error) { config.logger.warn(`rapier-jxl left ${relative(config.root, file)} as it is: ${error.code || ''} ${error.message}`); }
        }
      }
    },
  };
}
export default jxl;
