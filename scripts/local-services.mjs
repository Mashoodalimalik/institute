import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const candidates=[process.env.BRIDGE_EXE,join(process.env.LOCALAPPDATA || '', 'Programs','Okasha Bridge','OkashaBridge.exe'),resolve('output','bridge','portable','OkashaBridge.exe')].filter(Boolean);
const executable=candidates.find(existsSync);
if(!executable)throw Error('Build or install Okasha Bridge first: npm run build:bridge');
const alive=async port=>{try{const r=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(1500)});const d=await r.json();return r.ok&&d.apiVersion===3;}catch{return false;}};
const [hardware,whatsapp]=await Promise.all([alive(14318),alive(14320)]);
if(hardware!==whatsapp)throw Error('Only one adapter is running. Exit the old bridge before launching the combined bridge.');
const children=[];
if(!hardware)children.push(spawn(executable,['--background'],{stdio:'ignore',windowsHide:true}));
children.push(spawn(process.execPath,['scripts/local-backend.mjs'],{stdio:'inherit',windowsHide:true}));
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill();}
for(const child of children){child.on('error',error=>{console.error(error.message);stop();process.exitCode=1;});child.on('exit',code=>{if(!stopping){stop();process.exitCode=code || 1;}});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
