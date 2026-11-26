// SPDX-License-Identifier: MIT
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync,constants} from 'node:zlib';
const source=new URL('./jxl/jpeg-general-rows.c',import.meta.url);
const output=new URL('./jxl/jpeg-general-rows-bytes.mjs',import.meta.url);
const dir=mkdtempSync(join(tmpdir(),'jpeg-rows-wasm-'));
try {
  const built=join(dir,'general.wasm');
  const args=['--target=wasm32','-Oz','-msimd128','-ffp-contract=off','-fno-fast-math',
    '-fno-builtin','-nostdlib','-Wl,--no-entry','-Wl,--import-memory',
    '-Wl,--export=jpegGeneralRows','-Wl,--strip-all','-o',built,source.pathname];
  const compiler=spawnSync(process.env.WASM_CLANG||'clang',args,{encoding:'utf8'});
  if(compiler.status!==0)throw Error('clang JPEG sampler build failed: '+compiler.stderr);
  const raw=readFileSync(built),sha=createHash('sha256').update(raw).digest('hex');
  const module=new WebAssembly.Module(raw);
  if(JSON.stringify(WebAssembly.Module.imports(module))!==JSON.stringify([{module:'env',name:'memory',kind:'memory'}])||
     JSON.stringify(WebAssembly.Module.exports(module))!==JSON.stringify([{name:'jpegGeneralRows',kind:'function'}]))
    throw Error('JPEG sampler ABI changed');
  const br=brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:11}});
  const content=`// SPDX-License-Identifier: MIT
// Generated from jpeg-general-rows.c with repo/images/build-jpeg-general-rows.mjs.
// wasm SHA-256: ${sha}; raw ${raw.length} B, Brotli11 ${br.length} B.
// The sampler is loaded only for a general legal T.81 JPEG layout.
export const JPEG_GENERAL_ROWS = '${raw.toString('base64')}';
`;
  if(process.argv.includes('--check')) {
    const current=readFileSync(output,'utf8'),found=current.match(/export const JPEG_GENERAL_ROWS = '([^']+)'/);
    if(!found||!raw.equals(Buffer.from(found[1],'base64')))throw Error('Committed JPEG sampler differs from C rebuild');
  } else writeFileSync(output,content);
  console.log(JSON.stringify({sha256:sha,bytes:raw.length,brotli11:br.length,match:process.argv.includes('--check')}));
} finally {rmSync(dir,{recursive:true,force:true});}
