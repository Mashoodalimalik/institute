import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const result=spawnSync(process.env.BRIDGE_PYTHON || resolve('.venv-bridge/Scripts/python.exe'),['-m','pytest','bridge/hardware/tests','-q'],{stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONPATH:resolve('bridge/hardware/src')}});
if(result.error)console.error(result.error.message);
process.exitCode=result.status ?? 1;
