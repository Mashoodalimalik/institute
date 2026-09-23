import argparse
import os
from pathlib import Path
import secrets
import uvicorn
from ironledger_bridge.institute_api import create_app, VERSION

parser = argparse.ArgumentParser(prog='OkashaHardware')
parser.add_argument('command', nargs='?', default='serve', choices=['serve'])
parser.add_argument('--version', action='version', version=VERSION)
parser.parse_args()
directory = Path(os.environ.get('INSTITUTE_BRIDGE_DATA_DIR', Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'OkashaInstitute' / 'Bridge'))
directory.mkdir(parents=True, exist_ok=True)
key_file = directory / 'bridge.token'
token = os.environ.get('LOCAL_BRIDGE_TOKEN')
if not token:
    if not key_file.exists():
        try:
            with key_file.open('x') as file:
                file.write(secrets.token_hex(32))
        except FileExistsError:
            pass
    token = key_file.read_text().strip()
port = int(os.environ.get('BRIDGE_PORT', '14318'))
if not 1 <= port <= 65535:
    raise ValueError('Invalid bridge port')
origins = [value.strip() for value in os.environ.get('INSTITUTE_ALLOWED_ORIGINS', '*').split(',') if value.strip()]
uvicorn.run(create_app(token, origins), host='127.0.0.1', port=port, access_log=False, log_level='warning')
