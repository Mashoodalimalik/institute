export function gymaticOrigin(value) {
  if (!value || value === 'null') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
      && !url.port && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*gymatic\.co$/.test(url.hostname)
      && !value.endsWith('/');
  } catch { return false; }
}
export function loopbackHost(value) {
  try { const url = new URL('http://' + value); return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && url.pathname === '/'; }
  catch { return false; }
}
export function validateArguments(definition, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
  for (const key of Object.keys(args)) if (!definition.parameters.some(p => p.name === key)) throw new Error(`Unknown argument: ${key}`);
  const validate = (value, schema) => {
    if (Object.hasOwn(schema, 'const')) return value === schema.const;
    if (schema.anyOf) return schema.anyOf.some(s => validate(value, s));
    if (!schema.type) return true;
    if (schema.type === 'array') return Array.isArray(value) && value.every(v => validate(v, schema.items ?? {}));
    if (schema.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
    return typeof value === schema.type;
  };
  for (const param of definition.parameters) {
    if (!Object.hasOwn(args, param.name)) { if (param.required) throw new Error(`Missing argument: ${param.name}`); continue; }
    if (!validate(args[param.name], param.schema)) throw new Error(`Invalid argument: ${param.name}`);
  }
}

export function transportDecode(value, depth = 0) {
  if (depth > 30) throw new Error('Argument nesting is too deep');
  if (Array.isArray(value)) return value.map(v => transportDecode(v, depth + 1));
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.base64 === 'string') {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64)) throw new Error('Invalid base64');
      return Buffer.from(value.base64, 'base64');
    }
    for (const key of Object.keys(value)) if (['__proto__', 'constructor', 'prototype', 'filePath', 'path', 'url', 'stream'].includes(key)) throw new Error(`Use uploaded bytes instead of ${key}`);
    for (const key of ['image', 'video', 'audio', 'document', 'sticker']) if (typeof value[key] === 'string') throw new Error(`${key} requires bytes, not a local path or URL`);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, transportDecode(v, depth + 1)]));
  }
  return value;
}
export function transportEncode(value) {
  if (value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { base64: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return value.map(transportEncode);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !['creds', 'authState', 'signalRepository'].includes(k)).map(([k, v]) => [k, transportEncode(v)]));
  return value;
}
