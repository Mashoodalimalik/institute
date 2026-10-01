import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedUserFromInventory, planDeviceUser} from '../lib/enrollment-check.mjs';

const device={address:'192.0.2.1',port:4370};
const now=Date.now();
const row=()=>({component:'hardware',method:'get_identity_inventory',state:'succeeded',target:{device},finished_at:new Date(now).toISOString(),result:{users:[{uid:7,deviceUserId:'123',privilege:0,fingers:[]}]}});
test('web app resolves the internal UID separately from the saved student ID',()=>{
  assert.equal(checkedUserFromInventory(row(),device,'123',now),7);
  assert.throws(()=>checkedUserFromInventory(row(),device,'7',now),/not found/);
});
test('missing user is rejected before capture with a usable explanation',()=>{
  const r=row();r.result.users=[];
  assert.throws(()=>checkedUserFromInventory(r,device,'123',now),/after preparation/);
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

test('missing device user produces a standard-user create command without changing existing users',()=>{
  const r=row();
  assert.deepEqual(planDeviceUser(r,device,'456','New Student',[],now),{
    uid:1,user_id:'456',name:'New Student',privilege:0,password:'',group_id:'',card:0
  });
  assert.equal(r.result.users[0].deviceUserId,'123');
});
test('existing student identity skips set_user entirely',()=>{
  assert.equal(planDeviceUser(row(),device,'123','Changed name',[],now),null);
});
test('new users skip occupied, reserved and orphan fingerprint slots',()=>{
  const r=row();r.result.users[0].uid=1;r.result.orphanFingers=[{uid:3}];
  assert.equal(planDeviceUser(r,device,'456','Student',[2,4],now).uid,5);
});
test('creation requires a complete fresh inventory and stops when supported slots are exhausted',()=>{
  const r=row();r.result.users=null;
  assert.throws(()=>planDeviceUser(r,device,'456','Student',[],now),/incomplete/);
  assert.throws(()=>planDeviceUser(row(),device,'456','Student',Array.from({length:32767},(_,i)=>i+1),now),/No supported free/);
});
