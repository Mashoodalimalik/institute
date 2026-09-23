"""Generic device primitives. No membership, expiry or cleanup policy belongs here."""
import hashlib
import json


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def identity_inventory(connection):
    connection.read_sizes()
    expected = (connection.users, connection.fingers)
    users = list(connection.get_users())
    # Raw templates stay in this call; only metadata and one-way digests leave it.
    fingers = list(connection.get_templates())
    connection.read_sizes()
    if expected != (len(users), len(fingers)) or expected != (connection.users, connection.fingers):
        raise RuntimeError("Device inventory changed or was incomplete; no cleanup is safe")
    templates = [{"uid": int(f.uid), "slot": int(f.fid), "valid": int(f.valid),
                  "digest": hashlib.sha256(bytes(f.template)).hexdigest()} for f in fingers]
    rows = []
    for user in users:
        row = {"uid": int(user.uid), "deviceUserId": str(user.user_id), "name": str(user.name or ""),
               "privilege": int(user.privilege), "cardNumber": str(user.card) if user.card else None,
               "groupId": str(user.group_id or ""),
               "fingers": sorted([t for t in templates if t["uid"] == int(user.uid)], key=lambda t: (t["slot"], t["digest"]))}
        # Password participates in change detection but is never returned.
        row["revision"] = _digest({**row, "password": str(user.password or "")})
        rows.append(row)
    return {"users": rows, "orphanFingers": [t for t in templates if not any(u.uid == t["uid"] for u in users)],
            "templateCount": len(templates)}


def delete_identity_if_unchanged(connection, uid, user_id, revision):
    inventory = identity_inventory(connection)
    matches = [u for u in inventory["users"] if u["uid"] == uid or u["deviceUserId"] == user_id]
    if not matches:
        if any(f["uid"] == uid for f in inventory["orphanFingers"]):
            raise ValueError("Orphan fingerprints require device-specific recovery")
        return {"deleted": True, "alreadyAbsent": True, "uid": uid, "deviceUserId": user_id}
    if len(matches) != 1 or matches[0]["uid"] != uid or matches[0]["deviceUserId"] != user_id:
        raise ValueError("Device identity changed; cleanup was not performed")
    user = matches[0]
    if user["privilege"] != 0:
        raise ValueError("Administrator identities are protected")
    if user["revision"] != revision:
        raise ValueError("User, RFID or fingerprint changed; cleanup was not performed")
    connection.delete_user(uid=uid, user_id=user_id)
    connection.refresh_data()
    after = identity_inventory(connection)
    if any(u["uid"] == uid or u["deviceUserId"] == user_id for u in after["users"]) or any(f["uid"] == uid for f in after["orphanFingers"]):
        raise RuntimeError("Device did not confirm complete identity removal; inspect the inventory")
    return {"deleted": True, "uid": uid, "deviceUserId": user_id, "fingerprintsRemoved": len(user["fingers"]), "rfidRemoved": bool(user["cardNumber"])}
