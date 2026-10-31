// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';

export function wordContent(bytes) {
  const out=Buffer.from(bytes),name=Buffer.from('rapier/source.json'),gone=Buffer.from('rapier/source.gone');
  const end=out.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));assert(end>=0,'the Word file is a ZIP package');
  let found=0;
  for(let at=out.readUInt32LE(end+16);at<end;at+=46+out.readUInt16LE(at+28)+out.readUInt16LE(at+30)+out.readUInt16LE(at+32)) {
    assert.equal(out.readUInt32LE(at),0x02014b50,'ZIP directory entry');
    const length=out.readUInt16LE(at+28),local=out.readUInt32LE(at+42);
    if(!out.subarray(at+46,at+46+length).equals(name))continue;
    assert(out.subarray(local+30,local+30+length).equals(name),'ZIP local header names the same part');
    gone.copy(out,at+46);gone.copy(out,local+30);found++;
  }
  assert.equal(found,1,'a Rapier Word file carries its source');
  return out;
}

export async function readRapierWord(renderer,bytes,source) {
  assert.equal((await renderer.readWord(bytes)).markdown,source,'the Word reader returns the exact source the file carries');
  const native=await renderer.readWord(wordContent(bytes));
  assert.equal(native.canonical,undefined,'the Word content alone is read as Word, not from the carried source');
  return native.markdown;
}
