import {execFileSync} from 'node:child_process';

const oxide = process.env.JXL_OXIDE || '/home/user/tools/oxide/bin/jxl-oxide';
export function sections(file) {
  const text = execFileSync(oxide, ['info', '--with-offset', '-q', file], {stdio: ['ignore', 'pipe', 'ignore']}).toString();
  const out = {header: 0, lfGlobal: 0, lfGroups: 0, hfGlobal: 0, groups: 0};
  const header = /Frame header size: (\d+)/.exec(text), offset = /Offset \(in codestream\): (\d+)/.exec(text);
  if (header) out.header = Number(header[1]) + Number(offset?.[1] || 0);
  for (const [, kind, size] of text.matchAll(/^\s+(LfGlobal|LfGroup|HfGlobal|GroupPass)(?:\(\d+\)| \{[^}]*\})?: (\d+)/gm)) {
    out[{LfGlobal: 'lfGlobal', LfGroup: 'lfGroups', HfGlobal: 'hfGlobal', GroupPass: 'groups'}[kind]] += Number(size);
  }
  return out;
}

if (import.meta.url === 'file://' + process.argv[1]) for (const file of process.argv.slice(2)) console.log(file, JSON.stringify(sections(file)));
