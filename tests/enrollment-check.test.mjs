import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedUserFromInventory} from '../lib/enrollment-check.mjs';

const device={address:'192.0.2.1',port:4370};
const now=Date.now();
const row=()=>({component:'hardware',method:'get_identity_inventory',state:'succeeded',target:{device},finished_at:new Date(now).toISOString(),result:{users:[{uid:7,deviceUserId:'123',privilege:0,fingers:[]}]}});
test('web app resolves the internal UID separately from the saved student ID',()=>{
  assert.equal(checkedUserFromInventory(row(),device,'123',now),7);
  assert.throws(()=>checkedUserFromInventory(row(),device,'7',now),/not found/);
});
test('missing user is rejected before capture with a usable explanation',()=>{
  const r=row();r.result.users=[];
  assert.throws(()=>checkedUserFromInventory(r,device,'123',now),/Create the user/);
});
test('untrusted, stale and different-device checks cannot authorize capture',()=>{
  for(const patch of [{state:'running'},{method:'get_users'},{finished_at:null},{finished_at:new Date(now-61000).toISOString()},{target:{device:{address:'192.0.2.2'}}}]){
    assert.throws(()=>checkedUserFromInventory({...row(),...patch},device,'123',now),/check is incomplete or expired/);
  }
});
test('administrator identities and occupied fingerprint slots cannot be overwritten',()=>{
  const r=row();r.result.users[0].privilege=14;
  assert.throws(()=>checkedUserFromInventory(r,device,'123',now),/administrator/);
  r.result.users[0].privilege=0;r.result.users[0].fingers=[{slot:0}];
  assert.throws(()=>checkedUserFromInventory(r,device,'123',now),/already enrolled/);
});
