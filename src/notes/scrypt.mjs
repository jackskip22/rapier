// SPDX-License-Identifier: AGPL-3.0-only
// RFC 7914 scrypt, p=1. WebCrypto owns the two PBKDF2-HMAC-SHA-256 steps; this owner
// supplies the bounded Salsa20/8 ROMix. No passphrase, intermediate or derived key is logged.
const rotate = (word, bits) => word << bits | word >>> (32 - bits);
function quarter(words, a, b, c, d) {
 words[b] ^= rotate(words[a] + words[d] | 0,7);
 words[c] ^= rotate(words[b] + words[a] | 0,9);
 words[d] ^= rotate(words[c] + words[b] | 0,13);
 words[a] ^= rotate(words[d] + words[c] | 0,18);
}
function mix(input, output, block, scratch, r) {
 block.set(input.subarray(input.length-16));
 for(let i=0;i<2*r;i++) {
  for(let k=0;k<16;k++) block[k]^=input[i*16+k];
  scratch.set(block);
  for(let round=0;round<4;round++) {
   for(let j=0;j<4;j++) {const a=j*5;quarter(scratch,a,(a+4)%16,(a+8)%16,(a+12)%16);}
   for(let j=0;j<4;j++) {const a=j*5,base=j*4;quarter(scratch,a,base+(j+1)%4,base+(j+2)%4,base+(j+3)%4);}
  }
  for(let k=0;k<16;k++) block[k]=block[k]+scratch[k]|0;
  output.set(block,(i%2?r+(i-1)/2:i/2)*16);
 }
}
export async function scrypt(passphrase,salt,{N=32768,r=8}={}) {
 // Fixed production bounds also refuse an untrusted header's attempted allocation/work bomb.
 if(typeof passphrase!=='string' || !(salt instanceof Uint8Array) || !Number.isSafeInteger(N) || N<2 || N>32768 || (N&(N-1)) || !Number.isSafeInteger(r) || r<1 || r>8)
  throw Object.assign(new Error('unsupported scrypt work parameters'),{code:'kdf'});
 const password=new TextEncoder().encode(passphrase), words=32*r;
 const material=await crypto.subtle.importKey('raw',password,'PBKDF2',false,['deriveBits']);password.fill(0);
 const pbkdf=(value,bits)=>crypto.subtle.deriveBits({name:'PBKDF2',salt:value,iterations:1,hash:'SHA-256'},material,bits);
 const bytes=new Uint8Array(await pbkdf(salt,128*r*8)), view=new DataView(bytes.buffer);
 let x=new Uint32Array(words),y=new Uint32Array(words);
 const memory=new Uint32Array(N*words),block=new Uint32Array(16),scratch=new Uint32Array(16);
 const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
 try {
  for(let i=0;i<words;i++) x[i]=view.getUint32(i*4,true);
  for(let phase=0;phase<2;phase++) for(let i=0;i<N;i++) {
   if(phase===0) memory.set(x,i*words);
   else {const offset=(x[words-16]&(N-1))*words;for(let k=0;k<words;k++) x[k]^=memory[offset+k];}
   mix(x,y,block,scratch,r);[x,y]=[y,x];
   if((i&1023)===1023) await pause();
  }
  for(let i=0;i<words;i++) view.setUint32(i*4,x[i],true);
  return new Uint8Array(await pbkdf(bytes,256));
 } finally {bytes.fill(0);x.fill(0);y.fill(0);memory.fill(0);block.fill(0);scratch.fill(0);}
}
