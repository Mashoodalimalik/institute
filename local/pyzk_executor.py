"""One command in, one JSON result out. No database, tenant, polling or institute rules."""
import base64
import contextlib
import inspect
import ipaddress
import json
import sys
from datetime import datetime
from zk import ZK
from zk.user import User
from zk.finger import Finger

# Explicit library dispatch, never eval or arbitrary object/property access.
NAMES = '''HR_save_usertemplates clear_attendance clear_data clear_lcd delete_user
delete_user_template disable_device enable_device enroll_user get_attendance get_compat_old_firmware
get_device_name get_extend_fmt get_face_fun_on get_face_version get_firmware_version get_fp_version
get_lock_state get_mac get_network_params get_pin_width get_platform get_serialnumber get_templates
get_time get_user_extend_fmt get_user_template get_users poweroff read_sizes refresh_data restart
save_user_template set_time set_user test_voice unlock write_lcd'''.split()
FUNCTIONS = {name: getattr(ZK, name) for name in NAMES if callable(getattr(ZK, name, None))}


def catalog():
    return {'library': 'pyzk', 'functions': [
        {'name': name, 'mode': 'job', 'parameters': [
            {'name': key, 'required': p.default is inspect.Parameter.empty,
             'default': None if p.default is inspect.Parameter.empty else p.default}
            for key, p in inspect.signature(fn).parameters.items() if key != 'self']}
        for name, fn in sorted(FUNCTIONS.items())]}


def encode(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return {'base64': base64.b64encode(value).decode()}
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [encode(item) for item in value]
    if isinstance(value, dict):
        return {str(k): encode(v) for k, v in value.items()}
    if value.__class__.__module__.startswith('zk.'):
        return {k: encode(v) for k, v in vars(value).items() if not k.startswith('_')}
    raise ValueError('Unsupported library result')


def finger(data):
    template = base64.b64decode(data['template']['base64'], validate=True)
    if len(template) > 65535 or not 0 <= data['fid'] <= 9:
        raise ValueError('Invalid fingerprint')
    return Finger(data['uid'], data['fid'], data.get('valid', 1), template)


def arguments(name, args):
    if name not in FUNCTIONS or not isinstance(args, dict):
        raise ValueError('Unknown function or invalid arguments')
    inspect.signature(FUNCTIONS[name]).bind(None, **args)
    args = dict(args)
    if name == 'set_time':
        args['timestamp'] = datetime.fromisoformat(args['timestamp'])
        if args['timestamp'].tzinfo is not None:
            raise ValueError('pyzk requires device-local wall time')
    if name == 'save_user_template':
        args['user'] = User(**args['user'])
        args['fingers'] = [finger(item) for item in args.get('fingers', [])]
    if name == 'HR_save_usertemplates':
        args['usertemplates'] = [(User(**item['user']), [finger(f) for f in item['fingers']]) for item in args['usertemplates']]
    return args


def execute(command, factory=ZK):
    if command.get('catalog'):
        return catalog()
    started = False
    connection = None
    try:
        name = command.get('method')
        args = arguments(name, command.get('arguments'))
        device = command.get('target', {}).get('device')
        if not device or not device.get('address'):
            raise ValueError('Device connection details are required')
        ipaddress.ip_address(device['address'])
        port = device.get('port', 4370)
        if not isinstance(port, int) or not 1 <= port <= 65535:
            raise ValueError('Invalid device port')
        client = factory(device['address'], port=port, password=device.get('commKey', 0),
                         timeout=device.get('timeout', 10), force_udp=device.get('forceUdp', False), ommit_ping=True)
        connection = client.connect()
        started = True
        result = getattr(connection, name)(**args)
        if name == 'read_sizes':
            result = {key: getattr(connection, key, None) for key in ('users', 'fingers', 'records', 'cards', 'users_cap', 'fingers_cap', 'rec_cap')}
        return {'state': 'succeeded', 'result': encode(result)}
    except Exception as error:
        return {'state': 'uncertain' if started else 'failed', 'error': {'message': str(error)[:400]}}
    finally:
        if connection:
            with contextlib.suppress(Exception):
                connection.disconnect()


if __name__ == '__main__':
    try:
        command = json.loads(sys.stdin.read(16 * 1024 * 1024 + 1))
        with contextlib.redirect_stdout(sys.stderr):
            result = execute(command)
        print(json.dumps(result))
    except Exception as error:
        print(json.dumps({'state': 'failed', 'error': {'message': str(error)[:400]}}))
        sys.exit(1)
