import {isDeepStrictEqual} from 'node:util';

export function checkedUserFromInventory(row, device, userId, now = Date.now()) {
  const age = now - Date.parse(row?.finished_at);
  if(row?.component !== 'hardware' || row.method !== 'get_identity_inventory' || row.state !== 'succeeded'
    || !isDeepStrictEqual(row.target?.device, device) || !Number.isFinite(age) || age < 0 || age > 60000) {
    throw Error('Check the K40 users again before enrollment; the device check is incomplete or expired.');
  }
  const users = Array.isArray(row.result?.users) ? row.result.users : [];
  const matches = users.filter(u => u.deviceUserId === userId);
  if(matches.length !== 1 || !Number.isInteger(matches[0].uid) || matches[0].uid < 1) {
    throw Error('This student’s K40 user ID was not found on the device. Create the user on the K40 and save that same ID here.');
  }
  if(matches[0].privilege !== 0) throw Error('This K40 ID belongs to an administrator. Use the student’s own device user ID.');
  if(matches[0].fingers?.some(f => f.slot === 0)) throw Error('Fingerprint slot 0 is already enrolled for this K40 user. Check the saved user ID and existing fingerprint before replacing it.');
  return matches[0].uid;
}
