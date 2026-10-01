'use client';

import {cloudRequest, waitForCommand} from './client-bridge';

export async function enrollStudentFingerprint(studentId:string, enrollType:string, progress:(message:string)=>void) {
  const requestId=crypto.randomUUID();
  const step=(action:string)=>cloudRequest('/api/zkt/enroll',{studentId,enrollType,requestId,action});
  progress('Checking the student’s saved ID on the K40...');
  await waitForCommand((await step('check')).checkCommand,60000);
  const prepared=await step('prepare');
  if(prepared.creationCommand) {
    progress('Creating the student’s user record on the K40...');
    await waitForCommand(prepared.creationCommand,60000);
  }
  progress('Verifying the K40 user record...');
  await waitForCommand((await step('verify')).checkCommand,60000);
  const enrollment=await step('capture');
  progress('Follow the K40 prompts to scan the student’s finger...');
  await waitForCommand({requestId:enrollment.commandId,component:'hardware',state:enrollment.state},135000);
}
