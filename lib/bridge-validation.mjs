export function deviceConfiguration(value,previous={}) {
  if(!value || typeof value.id!=='string'||!/^[a-zA-Z0-9_.-]{1,64}$/.test(value.id))throw Error('A valid device ID is required');
  if(typeof value.address!=='string'||(value.address && (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value.address)||value.address.split('.').some(x=>Number(x)>255))))throw Error('Enter an IPv4 address or leave it empty');
  if(!Number.isInteger(value.port)||value.port<1||value.port>65535)throw Error('Invalid port');
  if(typeof value.forceUdp!=='boolean')throw Error('Invalid UDP setting');
  const commKey=value.commKey===''||value.commKey===undefined?(previous.commKey||0):Number(value.commKey);
  if(!Number.isInteger(commKey)||commKey<0||commKey>2147483647)throw Error('Invalid communication key');
  return {id:value.id,address:value.address,port:value.port,forceUdp:value.forceUdp,commKey,timeout:10};
}
export function normalizePhone(phone) {
  let digits=String(phone||'').replace(/[\s()+-]/g,'');
  if(/^03\d{9}$/.test(digits))digits='92'+digits.slice(1);
  if(!/^[1-9]\d{7,14}$/.test(digits))throw Error('Use a valid international phone number');
  return digits;
}
export function sanitizeSession(status,now=Date.now()) {
  const valid=status?.connection==='qr' && typeof status.qr==='string' && status.qr.startsWith('data:image/png;base64,') && status.qr.length<100000 && status.qrExpiresAt>now;
  return {connection:String(status?.connection||'disconnected').slice(0,40),account:status?.account?.id?{id:String(status.account.id).slice(0,100),name:String(status.account.name||'').slice(0,100)}:null,qr:valid?status.qr:null,qrExpiresAt:valid?status.qrExpiresAt:null,detail:status?.detail?String(status.detail).slice(0,300):null};
}
