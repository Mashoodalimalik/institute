from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from zk import ZK
from zk.finger import Finger
from ironledger_bridge.function_catalog import FUNCTIONS, execute


class Device:
    def __init__(self, retained):
        self.users = [SimpleNamespace(uid=7, user_id="123")]
        self.retained = retained
        self.refreshed = False
        self.captures = []

    @contextmanager
    def _connection(self):
        yield self

    def get_users(self):
        return self.users

    def refresh_data(self):
        self.refreshed = True

    def get_user_template(self, **arguments):
        assert self.refreshed
        assert arguments == {"uid": 7, "user_id": "123", "temp_id": 0}
        return self.retained


@pytest.fixture
def capture(monkeypatch):
    def enroll(connection, **arguments):
        connection.captures.append(arguments)
        return False  # Some devices still retain a template after this result.
    monkeypatch.setitem(FUNCTIONS, "enroll_user", enroll)


def test_pyzk_missing_user_returns_boolean():
    # Exercise the installed library's actual sentinel path without networking.
    device = SimpleNamespace(get_users=lambda: [])
    assert ZK.get_user_template(device, user_id="123") is False


@pytest.mark.parametrize("retained", [False, True, None,
    Finger(7, 0, 1, b""), Finger(8, 0, 1, b"template"),
    Finger(7, 1, 1, b"template"), Finger(7, 0, 0, b"template")])
def test_unverified_enrollment_never_reports_success(capture, retained):
    device = Device(retained)
    with pytest.raises(RuntimeError, match="could not be verified"):
        execute(device, "enroll_user", {"user_id": "123", "temp_id": 0})


def test_valid_template_readback_verifies_false_acknowledgement(capture):
    device = Device(Finger(7, 0, 1, b"template"))
    result = execute(device, "enroll_user", {"user_id": "123"})
    assert result == {"verifiedByReadBack": True, "sourceIdentity": "zk-user:123"}
    assert device.captures == [{"uid": 7, "user_id": "123"}]
    assert "template" not in str(result)


@pytest.mark.parametrize("arguments", [{"user_id": "999"}, {"uid": 8, "user_id": "123"}, {}])
def test_missing_or_mismatched_identity_never_starts_capture(capture, arguments):
    device = Device(None)
    with pytest.raises(ValueError, match="K40 user not found"):
        execute(device, "enroll_user", arguments)
    assert not device.captures
