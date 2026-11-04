const kinds = new Set(['bug', 'idea', 'other']);
const headers = {'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','access-control-allow-origin':'https://rapier.website',
  'referrer-policy':'no-referrer'};
const answer = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
const text = (value,length) => typeof value === 'string' && value.length <= length ? value : null;

export async function receiveFeedback(request,env) {
  if (request.method !== 'POST') return answer({error:'method not allowed'},405);
  const origin = request.headers.get('origin');
  if (origin !== 'https://rapier.website') return answer({error:'origin denied'},403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || ''))
    return answer({error:'expected JSON'},415);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 6000) return answer({error:'report too large'},413);
  if (!env.FEEDBACK_DB) return answer({error:'feedback unavailable'},503);
  let data;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error('missing body');
    const chunks = []; let length = 0;
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 6000) { await reader.cancel(); return answer({error:'report too large'},413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk,at); at += chunk.byteLength; }
    data = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch (_) { return answer({error:'invalid report'},400); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !kinds.has(data.kind))
    return answer({error:'invalid category'},400);
  const message = text(data.message,1600)?.trim();
  const version = text(data.version,40);
  const source = text(data.source,32);
  if (!message || new TextEncoder().encode(message).byteLength > 3000 ||
      !version || !/^[0-9a-zA-Z.\-]*$/.test(version) ||
      !source || !/^[a-zA-Z0-9-]+$/.test(source))
    return answer({error:'invalid report'},400);
  const receipt = text(data.id,36);
  if (!receipt || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt))
    return answer({error:'invalid report id'},400);
  try {
    const read = () => env.FEEDBACK_DB.prepare(
      'SELECT id,kind,message,version,source FROM feedback WHERE id = ?'
    ).bind(receipt).first();
    const matches = row => row?.id === receipt && row.kind === data.kind &&
      row.message === message && row.version === version && row.source === source;
    const existing = await read();
    if (existing) return matches(existing) ?
      answer({received:true,id:receipt}) : answer({error:'report id already used'},409);
    const bucket = Math.floor(Date.now() / 600000);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bucket+'|'+ip));
    const identity = Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
    const rate = await env.FEEDBACK_DB.prepare(
      'INSERT INTO feedback_rate(bucket,identity,count) VALUES(?,?,1) '+
      'ON CONFLICT(bucket,identity) DO UPDATE SET count=count+1 WHERE count < 4 RETURNING count'
    ).bind(bucket,identity).first();
    if (!rate) return answer({error:'rate limited'},429);
    const written = await env.FEEDBACK_DB.prepare(
      'INSERT OR IGNORE INTO feedback(id,kind,message,version,source) VALUES(?,?,?,?,?)'
    ).bind(receipt,data.kind,message,version,source).run();
    if (written?.meta?.changes !== 1) {
      const stored = await read();
      if (!stored) throw Error('feedback insert not confirmed');
      if (!matches(stored)) return answer({error:'report id already used'},409);
    }
    await env.FEEDBACK_DB.prepare('DELETE FROM feedback_rate WHERE bucket < ?').bind(bucket - 6).run().catch(()=>{});
    return answer({received:true,id:receipt});
  } catch (_) {
    return answer({error:'feedback unavailable'},503);
  }
}
