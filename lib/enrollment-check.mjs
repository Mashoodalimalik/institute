import {isDeepStrictEqual} from 'node:util';

export function checkedInventory(row, device, now = Date.now()) {
  const age = now - Date.parse(row?.finished_at);
  if(row?.component !== 'hardware' || row.method !== 'get_identity_inventory' || row.state !== 'succeeded'
    || !isDeepStrictEqual(row.target?.device, device) || !Number.isFinite(age) || age < 0 || age > 60000) {
    throw Error('Check the K40 users again before enrollment; the device check is incomplete or expired.');
  }
  if(!Array.isArray(row.result?.users)) throw Error('The K40 user list is incomplete. Check the device again.');
  return row.result.users;
}

export function checkedUserFromInventory(row, device, userId, now = Date.now()) {
  const users = checkedInventory(row, device, now);
  const matches = users.filter(u => u.deviceUserId === userId);
  if(matches.length !== 1 || !Number.isInteger(matches[0].uid) || matches[0].uid < 1) {
    throw Error('This student’s K40 user ID was not found on the device after preparation. Check the saved ID and device result before retrying enrollment.');
  }
  if(matches[0].privilege !== 0) throw Error('This K40 ID belongs to an administrator. Use the student’s own device user ID.');
  if(matches[0].fingers?.some(f => f.slot === 0)) throw Error('Fingerprint slot 0 is already enrolled for this K40 user. Check the saved user ID and existing fingerprint before replacing it.');
  return matches[0].uid;
}

export function planDeviceUser(row, device, userId, name, reservedUids = [], now = Date.now()) {
  const users = checkedInventory(row, device, now);
  if(users.some(u => u.deviceUserId === userId)) {
    checkedUserFromInventory(row, device, userId, now);
    return null; // Never call set_user on an existing identity.
  }
  const occupied = new Set([...users.map(u => u.uid), ...reservedUids,
    ...(row.result.orphanFingers || []).map(f => f.uid)]);
  // pyzk's single-template read packs UID as a signed 16-bit value.
  let uid = 1;
  while(occupied.has(uid) && uid <= 32767) uid++;
  if(uid > 32767) throw Error('No supported free K40 user slot is available.');
  return {uid, user_id:userId, name:name.trim().slice(0,24), privilege:0, password:'', group_id:'', card:0};
}
