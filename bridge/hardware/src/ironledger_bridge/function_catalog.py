from __future__ import annotations

import base64
import inspect
from contextlib import contextmanager
from datetime import datetime
from typing import Any

from zk import ZK
from zk.finger import Finger
from zk.user import User
from .identity_inventory import identity_inventory, delete_identity_if_unchanged

# Explicit dispatch set: never resolve arbitrary attributes supplied over HTTP.
CALLABLE = frozenset("""HR_save_usertemplates clear_attendance clear_data clear_lcd delete_user
delete_user_template enable_device enroll_user get_attendance get_compat_old_firmware
get_device_name get_extend_fmt get_face_fun_on get_face_version get_firmware_version get_fp_version
get_lock_state get_mac get_network_params get_pin_width get_platform get_serialnumber get_templates
get_time get_user_extend_fmt get_user_template get_users poweroff read_sizes refresh_data restart
save_user_template set_time set_user test_voice unlock write_lcd""".split())
MANAGED = {
    "disable_device": "Persistent device disable conflicts with live capture, which enables the device. Pause monitoring before implementing this operation; no misleading temporary disable is exposed.",
    "connect": "Connection acquisition is owned by the device scheduler; use device configuration/test",
    "disconnect": "Connection teardown is owned by the device scheduler; disable monitoring through device configuration",
    "live_capture": "Subscribe to the scan SSE stream",
    "cancel_capture": "Capture is paused and restored by the device scheduler",
    "reg_event": "Event registration is owned by the scan stream",
    "free_data": "Protocol buffer lifecycle is owned by pyzk operations",
    "read_with_buffer": "Raw protocol commands are internal; use the corresponding typed function",
    "set_sdk_build_1": "Protocol negotiation is owned by the adapter",
    "verify_user": "Verification session lifecycle is owned by enrollment/capture",
}
READS = frozenset(name for name in CALLABLE if name.startswith("get_")) | {"read_sizes"}
FUNCTIONS = {name: getattr(ZK, name) for name in CALLABLE}
EXTENSIONS = {"get_identity_inventory": identity_inventory, "delete_identity_if_unchanged": delete_identity_if_unchanged}
READS = READS | {"get_identity_inventory"}
FUNCTIONS.update(EXTENSIONS)


def catalog() -> list[dict]:
    values = []
    for name in sorted(CALLABLE | MANAGED.keys() | EXTENSIONS.keys()):
        signature = inspect.signature(EXTENSIONS[name] if name in EXTENSIONS else getattr(ZK, name))
        parameters = []
        for key, param in signature.parameters.items():
            if key in {"self", "connection"}:
                continue
            parameters.append({"name": key, "required": param.default is inspect.Parameter.empty,
                               "default": None if param.default is inspect.Parameter.empty else param.default})
        values.append({"name": name, "parameters": parameters, "mode": "job" if name in FUNCTIONS else "managed",
                       "mutates": name not in READS, "deviceSupport": "unknown", "reason": MANAGED.get(name),
                       "argumentsSchema": {"type": "object", "additionalProperties": False,
                           "properties": {p["name"]: parameter_schema(p["name"]) for p in parameters},
                           "required": [p["name"] for p in parameters if p["required"]]}})
    return values


def parameter_schema(key: str) -> dict:
    if key in {"name", "password", "group_id", "user_id", "text", "timestamp", "revision"}:
        return {"type": "string", "maxLength": 512}
    if key in {"uid", "temp_id", "privilege", "card", "index", "time", "line_number"}:
        return {"type": ["integer", "null"] if key == "uid" else "integer", "minimum": 0}
    return {"type": "array" if key in {"fingers", "usertemplates"} else "object"}


def validate(name: str, arguments: dict) -> dict:
    if name not in FUNCTIONS:
        raise ValueError(MANAGED.get(name, "Unknown function"))
    if not isinstance(arguments, dict):
        raise ValueError("arguments must be an object")
    try:
        inspect.signature(FUNCTIONS[name]).bind(None, **arguments)
    except TypeError as error:
        raise ValueError(str(error)) from error
    for key, value in arguments.items():
        schema = parameter_schema(key)
        if schema["type"] == "string" and (not isinstance(value, str) or len(value) > 512):
            raise ValueError(f"{key} must be a string of at most 512 characters")
        if key in {"uid", "temp_id", "privilege", "card", "index", "time", "line_number"}:
            if value is None and key == "uid":
                continue
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"{key} must be a non-negative integer")
            maximum = {"uid": 65535, "temp_id": 9, "privilege": 14, "card": 4294967295, "time": 60,
                       "index": 255, "line_number": 255}[key]
            if value > maximum:
                raise ValueError(f"{key} exceeds {maximum}")
        if key == "privilege" and value not in (0, 14):
            raise ValueError("This pyzk setter supports privilege 0 or 14; it cannot reliably disable a user")
    converted = dict(arguments)
    if name == "delete_identity_if_unchanged":
        if not isinstance(arguments.get("uid"), int) or isinstance(arguments["uid"], bool) or arguments["uid"] < 1:
            raise ValueError("A positive internal UID is required")
        if not arguments.get("user_id") or not __import__('re').fullmatch(r"[a-f0-9]{64}", arguments.get("revision", "")):
            raise ValueError("The exact user ID and inventory revision are required")
    if name == "set_time":
        converted["timestamp"] = datetime.fromisoformat(arguments["timestamp"])
        if converted["timestamp"].tzinfo is not None:
            raise ValueError("set_time requires the intended device-local wall time without a timezone suffix")
    if name == "save_user_template":
        converted["user"] = decode_user(arguments["user"])
        converted["fingers"] = [decode_finger(f) for f in arguments.get("fingers", [])]
    if name == "HR_save_usertemplates":
        converted["usertemplates"] = [(decode_user(item["user"]), [decode_finger(f) for f in item["fingers"]]) for item in arguments["usertemplates"]]
    return converted


def decode_user(value: Any) -> User:
    if not isinstance(value, dict):
        raise ValueError("user must contain a User object")
    return User(**{key: value[key] for key in ("uid", "name", "privilege", "password", "group_id", "user_id", "card") if key in value})


def decode_finger(value: dict) -> Finger:
    data = base64.b64decode(value["template"]["base64"], validate=True)
    if len(data) > 65535 or not 0 <= int(value["fid"]) <= 9:
        raise ValueError("Invalid fingerprint size or slot")
    return Finger(value["uid"], value["fid"], value.get("valid", 1), data)


def encode(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return {"base64": base64.b64encode(value).decode()}
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (tuple, list)):
        return [encode(item) for item in value]
    if isinstance(value, dict):
        return {str(key): encode(item) for key, item in value.items()}
    if isinstance(value, Finger):
        return {key: encode(getattr(value, key)) for key in ("uid", "fid", "valid", "template")}
    if isinstance(value, User):
        return {key: encode(getattr(value, key)) for key in ("uid", "name", "privilege", "password", "group_id", "user_id", "card")}
    if value.__class__.__module__.startswith("zk."):
        return {key: encode(item) for key, item in vars(value).items() if not key.startswith("_")}
    raise ValueError(f"Unsupported result type: {type(value).__name__}")


@contextmanager
def enrollment_session(connection):
    """Keep pyzk's enrollment setup and capture on the same SDK connection."""
    failure = None
    try:
        # Mirrors pyzk/test_machine.py setup, without deleting any templates.
        connection.set_sdk_build_1()
        connection.disable_device()
        connection.reg_event(0xFFFF)
        yield
    except BaseException as error:
        failure = error
        raise
    finally:
        cleanup_errors = []
        # pyzk raises its socket timeout to 60s during capture and only resets
        # it on its normal return path. Restore it before error cleanup too.
        sock = getattr(connection, '_ZK__sock', None)
        timeout = getattr(connection, '_ZK__timeout', None)
        if sock is not None and timeout is not None:
            try:
                sock.settimeout(timeout)
            except Exception as error:
                cleanup_errors.append(str(error))
        for method, args in ((connection.reg_event, (0,)), (connection.cancel_capture, ()),
                             (connection.verify_user, ()), (connection.enable_device, ())):
            try:
                method(*args)
            except Exception as error:
                cleanup_errors.append(str(error))
        if cleanup_errors:
            message = 'Enrollment cleanup was incomplete; check that the K40 is back in attendance mode.'
            if failure is not None:
                failure.add_note(message)
            else:
                raise RuntimeError(message)


def enroll_and_verify(connection, converted):
    with enrollment_session(connection):
        acknowledged = FUNCTIONS['enroll_user'](connection, **converted)
        connection.refresh_data()
        retained = connection.get_user_template(uid=converted['uid'], user_id=converted['user_id'], temp_id=converted.get('temp_id', 0))
        if (not isinstance(retained, Finger) or not retained.valid or not retained.template
                or retained.uid != converted['uid'] or retained.fid != converted.get('temp_id', 0)):
            transport = 'TCP' if getattr(connection, 'tcp', False) else 'UDP'
            raise RuntimeError(f"Fingerprint enrollment could not be verified on the K40 ({transport}; capture completed: {bool(acknowledged)}). Check whether the device prompted for scans and saved a fingerprint before retrying.")
        return {'verifiedByReadBack': True, 'sourceIdentity': f"zk-user:{converted['user_id']}"}


def execute(adapter: Any, name: str, arguments: dict, *, preflight=None) -> Any:
    converted = validate(name, arguments)
    if not hasattr(adapter, "_connection"):
        raise ValueError("Raw pyzk functions require a zk-standalone device")
    with adapter._connection() as connection:
        if preflight is not None:
            preflight(connection)
        if name == "enroll_user":
            # Resolve both identifiers before capture. pyzk accepts a user_id
            # that is absent on the device, then returns False on readback.
            uid, user_id = converted.get("uid"), converted.get("user_id", "")
            user = next((u for u in connection.get_users()
                         if (not uid or u.uid == uid)
                         and (not user_id or str(u.user_id) == user_id)), None) if uid or user_id else None
            if user is None:
                raise ValueError("K40 user not found. Run user preparation from the web app and verify the saved K40 user ID before capture.")
            converted.update(uid=int(user.uid), user_id=str(user.user_id))
            return enroll_and_verify(connection, converted)
        if name == "delete_user_template":
            users = connection.get_users()
            user = next((u for u in users if (converted.get("uid") and u.uid == converted["uid"]) or (not converted.get("uid") and str(u.user_id) == str(converted.get("user_id", "")))), None)
            if user is None:
                raise ValueError("Device user not found")
            result = adapter._delete_fingerprint_template(connection, uid=user.uid, device_user_id=str(user.user_id), finger_slot=converted.get("temp_id", 0))
        else:
            result = FUNCTIONS[name](connection, **converted)
        if name == "read_sizes":
            result = {key: getattr(connection, key, None) for key in
                      ("users", "fingers", "records", "cards", "users_cap", "fingers_cap", "rec_cap", "users_av", "fingers_av", "rec_av")}
        if name == "get_lock_state":
            result = {"commandAcknowledged": bool(result), "physicalLockState": "unknown"}
        return encode(result)
