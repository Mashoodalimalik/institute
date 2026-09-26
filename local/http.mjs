import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export function localURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('A loopback HTTP origin is required');
  return url;
}

export function jsonServer({ token, handler, allowedOrigins = [], health = {} }) {
  if (!token || token.length < 32) throw new Error('Configure a random server token of at least 32 characters');
  const expected = Buffer.from(`Bearer ${token}`);
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const send = (value, status = 200) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host || '')) return send({error:'Loopback Host required'}, 403);
    const url = new URL(req.url, 'http://127.0.0.1');
    const origin=req.headers.origin;
    if(origin && !allowedOrigins.includes('*') && !allowedOrigins.includes(origin))return send({error:'Origin is not allowed'},403);
    if(origin){
      res.setHeader('Access-Control-Allow-Origin',allowedOrigins.includes('*')?'*':origin);
      res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      if(req.headers['access-control-request-private-network']==='true')res.setHeader('Access-Control-Allow-Private-Network','true');
    }
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if (req.method === 'GET' && url.pathname === '/health') return send({status:'ok', apiVersion:3,...health});
    const isPublicRead = req.method === 'GET' && ['/v1/status', '/v1/whatsapp/session', '/v1/hardware/config'].includes(url.pathname);
    if (!isPublicRead) {
      const supplied = Buffer.from(req.headers.authorization || '');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send({error:'Unauthorized local service request'}, 403);
    }
    try {
      let body;
      if (req.method === 'POST') {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return send({error:'JSON required'}, 415);
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16 * 1024 * 1024) { send({error:'Request exceeds 16 MiB'}, 413); req.resume(); return; }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString());
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send({error:'JSON object required'}, 400);
      }
      const result = await handler({method:req.method, url, body});
      send(result?.body ?? {error:'Unknown endpoint'}, result?.status ?? 404);
    } catch (error) { send({error:String(error.message).slice(0,400)}, error.status || 400); }
  });
  server.requestTimeout = 20000;
  return server;
}

export async function localRequest(url, token, path, body, timeout = 10000) {
  const response = await fetch(new URL(path, localURL(url)), {
    method: body === undefined ? 'GET' : 'POST', cache:'no-store',
    headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
    body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(timeout),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `Local service HTTP ${response.status}`);
    error.status = response.status; throw error;
  }
  return data;
}
