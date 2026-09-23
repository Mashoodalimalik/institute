from types import SimpleNamespace
import pytest
from ironledger_bridge.identity_inventory import identity_inventory, delete_identity_if_unchanged
from ironledger_bridge.function_catalog import validate, catalog


class Device:
    def __init__(self):
        self.user_rows = [SimpleNamespace(uid=1, user_id="10", name="Member", privilege=0, card=123, group_id="0", password="private")]
        self.finger_rows = [SimpleNamespace(uid=1, fid=0, valid=1, template=b"secret-biometric-bytes")]
        self.deleted = []

    def read_sizes(self):
        self.users, self.fingers = len(self.user_rows), len(self.finger_rows)

    def get_users(self):
        return self.user_rows

    def get_templates(self):
        return self.finger_rows

    def delete_user(self, uid, user_id):
        self.deleted.append((uid, user_id))
        self.user_rows = [u for u in self.user_rows if u.uid != uid]
        self.finger_rows = [f for f in self.finger_rows if f.uid != uid]

    def refresh_data(self):
        pass


def test_inventory_never_exports_template_or_password():
    data = identity_inventory(Device())
    assert data["users"][0]["cardNumber"] == "123"
    assert data["templateCount"] == 1
    assert "secret-biometric" not in str(data)
    assert "private" not in str(data)
    assert "template" not in data["users"][0]["fingers"][0]


@pytest.mark.parametrize("change", ["card", "finger", "password", "admin", "reused-id"])
def test_changed_identity_cannot_be_deleted(change):
    d = Device()
    revision = identity_inventory(d)["users"][0]["revision"]
    if change == "card": d.user_rows[0].card = 456
    if change == "finger": d.finger_rows[0].template = b"different"
    if change == "password": d.user_rows[0].password = "new"
    if change == "admin": d.user_rows[0].privilege = 14
    if change == "reused-id": d.user_rows[0].uid = 2
    with pytest.raises(ValueError):
        delete_identity_if_unchanged(d, 1, "10", revision)
    assert not d.deleted


def test_removal_verifies_user_fingerprints_and_rfid():
    d = Device()
    revision = identity_inventory(d)["users"][0]["revision"]
    result = delete_identity_if_unchanged(d, 1, "10", revision)
    assert result["deleted"] and result["fingerprintsRemoved"] == 1 and result["rfidRemoved"]
    assert not d.user_rows and not d.finger_rows
    assert delete_identity_if_unchanged(d, 1, "10", revision)["alreadyAbsent"]


def test_orphan_fingers_reported_without_unsafe_delete():
    d = Device(); d.user_rows = []
    assert len(identity_inventory(d)["orphanFingers"]) == 1
    with pytest.raises(ValueError, match="Orphan"):
        delete_identity_if_unchanged(d, 1, "10", "a" * 64)
    assert not d.deleted


def test_partial_inventory_fails_closed():
    d = Device()
    d.get_users = lambda: []
    with pytest.raises(RuntimeError, match="incomplete"):
        identity_inventory(d)


def test_extensions_have_typed_validation():
    assert next(f for f in catalog() if f["name"] == "get_identity_inventory")["mutates"] is False
    validate("delete_identity_if_unchanged", {"uid": 1, "user_id": "10", "revision": "a" * 64})
    for args in [{"uid": None, "user_id": "10", "revision": "a" * 64}, {"uid": 1, "user_id": "", "revision": "a" * 64}, {"uid": 1, "user_id": "10", "revision": "wrong"}]:
        with pytest.raises(ValueError): validate("delete_identity_if_unchanged", args)


def test_conditional_delete_api_requires_serial_and_deadline():
    from fastapi.testclient import TestClient
    from ironledger_bridge.institute_api import create_app
    with TestClient(create_app('x' * 64), base_url='http://127.0.0.1') as client:
        command = {'component': 'hardware', 'method': 'delete_identity_if_unchanged',
                   'target': {'device': {'address': '192.168.1.20'}},
                   'arguments': {'uid': 1, 'user_id': '10', 'revision': 'a' * 64}}
        response = client.post('/v1/execute', headers={'Authorization': 'Bearer ' + 'x' * 64}, json=command)
        assert response.status_code == 400
        assert 'serial and expiry' in response.json()['error']