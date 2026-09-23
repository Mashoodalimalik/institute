from __future__ import annotations

import base64
import inspect
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


def execute(adapter: Any, name: str, arguments: dict, *, preflight=None) -> Any:
    converted = validate(name, arguments)
    if not hasattr(adapter, "_connection"):
        raise ValueError("Raw pyzk functions require a zk-standalone device")
    with adapter._connection() as connection:
        if preflight is not None:
            preflight(connection)
        if name == "delete_user_template":
            users = connection.get_users()
            user = next((u for u in users if (converted.get("uid") and u.uid == converted["uid"]) or (not converted.get("uid") and str(u.user_id) == str(converted.get("user_id", "")))), None)
            if user is None:
                raise ValueError("Device user not found")
            result = adapter._delete_fingerprint_template(connection, uid=user.uid, device_user_id=str(user.user_id), finger_slot=converted.get("temp_id", 0))
        else:
            result = FUNCTIONS[name](connection, **converted)
        if name == "enroll_user":
            retained = connection.get_user_template(uid=converted.get("uid", 0), user_id=converted.get("user_id", ""), temp_id=converted.get("temp_id", 0))
            if retained is None:
                raise RuntimeError("The device did not retain the enrolled fingerprint")
            user = next((u for u in connection.get_users() if int(u.uid) == int(retained.uid)), None)
            result = {"verifiedByReadBack": True, "sourceIdentity": f"zk-user:{user.user_id}" if user else None}
        if name == "read_sizes":
            result = {key: getattr(connection, key, None) for key in
                      ("users", "fingers", "records", "cards", "users_cap", "fingers_cap", "rec_cap", "users_av", "fingers_av", "rec_av")}
        if name == "get_lock_state":
            result = {"commandAcknowledged": bool(result), "physicalLockState": "unknown"}
        return encode(result)
