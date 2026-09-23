import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function bridgeDataDirectory() {
  return process.env.INSTITUTE_BRIDGE_DATA_DIR || join(process.env.LOCALAPPDATA || resolve('.bridge'),'OkashaInstitute','Bridge');
}
export function bridgeToken() {
  const path=join(bridgeDataDirectory(),'bridge.token');
  return existsSync(path)?readFileSync(path,'utf8').trim():process.env.LOCAL_BRIDGE_TOKEN;
}
