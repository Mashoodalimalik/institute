from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from datetime import timezone
from struct import pack
from threading import Event, RLock
from typing import Any, Iterator

from ..models import (
    AdapterHealth,
    CredentialType,
    DeviceConnectionState,
    EnrollmentRequest,
    EnrollmentResult,
    HardwareUser,
    PolledHardwareEvent,
)
from .base import HardwareAdapter


class ZKStandaloneAdapter(HardwareAdapter):
    """Adapter for standalone ZKTeco devices supported by the pyzk protocol."""

    adapter_type = "zk-standalone"
    capabilities = frozenset(
        {"identity.create", "identity.list", "identity.delete", "rfid.enroll", "fingerprint.enroll", "events.live", "events.poll"}
    )

    def __init__(
        self,
        *,
        address: str,
        port: int = 4370,
        comm_key: int = 0,
        timeout: int = 5,
        force_udp: bool = False,
        omit_ping: bool = True,
    ) -> None:
        if not address:
            raise ValueError("A network address is required for a ZKTeco device")
        self.address = address
        self.port = port
        self.comm_key = comm_key
        self.timeout = timeout
        self.force_udp = force_udp
        self.omit_ping = omit_ping
        self._lock = RLock()

    def _new_client(self) -> Any:
        try:
            from zk import ZK
        except ImportError as error:
            raise RuntimeError("pyzk is not installed; install Bridge requirements") from error
        return ZK(
            self.address,
            port=self.port,
            timeout=self.timeout,
            password=self.comm_key,
            force_udp=self.force_udp,
            ommit_ping=self.omit_ping,
        )

    @contextmanager
    def _connection(self) -> Iterator[Any]:
        with self._lock:
            connection = self._new_client().connect()
            try:
                yield connection
            finally:
                try:
                    connection.disconnect()
                except Exception:
                    pass

    def health(self) -> AdapterHealth:
        try:
            with self._connection() as connection:
                connection.read_sizes()
                details = {
                    "model": self._safe_read(connection.get_device_name),
                    "serialNumber": self._safe_read(connection.get_serialnumber),
                    "firmwareVersion": self._safe_read(connection.get_firmware_version),
                    "platform": self._safe_read(connection.get_platform),
                    "fingerprintAlgorithm": self._safe_read(connection.get_fp_version),
                    "users": getattr(connection, "users", None),
                    "fingerprints": getattr(connection, "fingers", None),
                    "attendanceRecords": getattr(connection, "records", None),
                    "address": self.address,
                    "port": self.port,
                }
            return AdapterHealth(state=DeviceConnectionState.ONLINE, details=details)
        except Exception as error:
            return AdapterHealth(
                state=DeviceConnectionState.OFFLINE,
                details={"address": self.address, "port": self.port},
                error=self._clean_error(error),
            )

    @staticmethod
    def _safe_read(reader: Any) -> Any:
        try:
            return reader()
        except Exception:
            return None

    @staticmethod
    def _clean_error(error: Exception) -> str:
        message = str(error).strip() or error.__class__.__name__
        return message[:240]

    def list_users(self) -> list[HardwareUser]:
        with self._connection() as connection:
            return [self._user(user) for user in connection.get_users()]

    def delete_user(self, device_user_id: str) -> HardwareUser:
        """Remove a device identity after verifying the exact user before and after deletion."""
        with self._connection() as connection:
            current = next(
                (user for user in connection.get_users() if str(user.user_id) == device_user_id),
                None,
            )
            if current is None:
                raise KeyError(f"Device user {device_user_id} was not found")
            if int(getattr(current, "privilege", 0)) != 0:
                raise ValueError("Administrator device users cannot be deleted from Gymatic")
            deleted_user = self._user(current)
            connection.delete_user(uid=int(current.uid), user_id=device_user_id)
            connection.refresh_data()
            still_present = any(
                str(user.user_id) == device_user_id for user in connection.get_users()
            )
            if still_present:
                raise RuntimeError("The device did not delete this user")
            return deleted_user

    @staticmethod
    def _user(user: Any) -> HardwareUser:
        card = getattr(user, "card", 0)
        return HardwareUser(
            device_user_id=str(getattr(user, "user_id", "")),
            uid=int(getattr(user, "uid", 0)),
            name=str(getattr(user, "name", "") or ""),
            privilege=int(getattr(user, "privilege", 0)),
            card_number=str(card) if card else None,
            group_id=str(getattr(user, "group_id", "") or "") or None,
        )

    @staticmethod
    def _delete_fingerprint_template(
        connection: Any, *, uid: int, device_user_id: str, finger_slot: int
    ) -> bool:
        if not getattr(connection, "tcp", False):
            return bool(connection.delete_user_template(uid=uid, temp_id=finger_slot))

        # pyzk's TCP-specific deletion path is the right protocol for these
        # devices, but the pinned release passes str(user_id) to a `24s` struct
        # field and raises TypeError before sending anything. Keep that protocol
        # path while supplying the bytes payload it expects.
        sender = getattr(connection, "_ZK__send_command", None)
        if not callable(sender):
            raise RuntimeError("The ZKTeco client does not support TCP fingerprint deletion")
        from zk import const

        encoding = str(getattr(connection, "encoding", "utf-8") or "utf-8")
        payload = pack("<24sB", device_user_id.encode(encoding, errors="ignore"), finger_slot)
        response = sender(const._CMD_DEL_USER_TEMP, payload)
        return bool(response.get("status"))

    def enroll(self, request: EnrollmentRequest) -> EnrollmentResult:
        if request.credential_type not in {CredentialType.RFID, CredentialType.FINGERPRINT}:
            raise ValueError(f"The ZKTeco standalone adapter cannot enroll {request.credential_type}")
        if request.credential_type == CredentialType.RFID and not request.card_number:
            raise ValueError("cardNumber is required for RFID enrollment")

        with self._connection() as connection:
            existing = list(connection.get_users())
            device_user_id = request.device_user_id or self._next_user_id(existing)
            current = next((user for user in existing if str(user.user_id) == device_user_id), None)
            uid = int(current.uid) if current else self._next_uid(existing)
            name = (request.user_name or f"User {device_user_id}")[:24]
            privilege = int(getattr(current, "privilege", 0)) if current else 0
            password = str(getattr(current, "password", "") or "") if current else ""
            group_id = str(getattr(current, "group_id", "") or "") if current else ""
            current_card = int(getattr(current, "card", 0)) if current else 0
            card = int(request.card_number) if request.credential_type == CredentialType.RFID else current_card

            # K50 and similar devices require the user record to exist before fingerprint enrollment.
            connection.set_user(
                uid=uid,
                name=name,
                privilege=privilege,
                password=password,
                group_id=group_id,
                user_id=device_user_id,
                card=card,
            )
            connection.refresh_data()
            saved = next((user for user in connection.get_users() if str(user.user_id) == device_user_id), None)
            if saved is None:
                raise RuntimeError("The device did not retain the user record")

            if request.credential_type == CredentialType.FINGERPRINT:
                existing_template = next(
                    (
                        template
                        for template in connection.get_templates()
                        if int(template.uid) == int(saved.uid) and int(template.fid) == request.finger_slot
                    ),
                    None,
                )
                if existing_template is not None and not request.replace:
                    raise ValueError(
                        f"Fingerprint slot {request.finger_slot} is already enrolled for this device user"
                    )
                if existing_template is not None:
                    deleted = self._delete_fingerprint_template(
                        connection,
                        uid=int(saved.uid),
                        device_user_id=device_user_id,
                        finger_slot=request.finger_slot,
                    )
                    if not deleted:
                        raise RuntimeError("The existing fingerprint slot could not be replaced")
                    connection.refresh_data()

                adapter_reported_success = connection.enroll_user(
                    uid=int(saved.uid), temp_id=request.finger_slot, user_id=device_user_id
                )
                connection.refresh_data()
                saved_template = next(
                    (
                        template
                        for template in connection.get_templates()
                        if int(template.uid) == int(saved.uid) and int(template.fid) == request.finger_slot
                    ),
                    None,
                )
                # Some K50 firmware writes a valid template but sends a completion packet
                # that pyzk interprets as False. The read-back is authoritative.
                if saved_template is None:
                    report = "" if adapter_reported_success else " (the device also reported failure)"
                    raise RuntimeError(f"The device did not retain the fingerprint template{report}")
                reference = f"zk-user:{device_user_id}:finger:{request.finger_slot}"
            else:
                if int(getattr(saved, "card", 0)) != int(request.card_number or "0"):
                    raise RuntimeError("The device did not retain the RFID card number")
                reference = f"zk-user:{device_user_id}:rfid:{request.card_number}"

            return EnrollmentResult(
                opaque_reference=reference,
                source_identity=f"zk-user:{device_user_id}",
                device_user_id=device_user_id,
                details={
                    "uid": int(saved.uid),
                    "fingerSlot": request.finger_slot,
                    "verifiedByReadBack": request.credential_type == CredentialType.FINGERPRINT,
                },
            )

    @staticmethod
    def _next_uid(users: list[Any]) -> int:
        occupied = {int(user.uid) for user in users}
        for uid in range(1, 65_535):
            if uid not in occupied:
                return uid
        raise RuntimeError("The device has no available numeric user slots")

    @staticmethod
    def _next_user_id(users: list[Any]) -> str:
        occupied = {str(user.user_id) for user in users}
        candidate = max((int(value) for value in occupied if value.isdigit()), default=0) + 1
        while str(candidate) in occupied:
            candidate += 1
        return str(candidate)

    def poll_events(self, cursor: str | None) -> tuple[list[PolledHardwareEvent], str | None]:
        with self._connection() as connection:
            attendance = list(connection.get_attendance())
        count = len(attendance)
        hashes = [hashlib.sha256("|".join([str(r.user_id), r.timestamp.isoformat(), str(r.status), str(r.punch)]).encode()).hexdigest() for r in attendance]
        next_cursor = json.dumps({"count": count, "tail": hashes[-128:]}, separators=(",", ":"))
        if cursor is None:
            # Establish a baseline on first connection. Historical device logs are not replayed.
            return [], next_cursor
        if cursor.startswith("{"):
            prior = json.loads(cursor)
            known = set(prior.get("tail", []))
            matches = [index for index, fingerprint in enumerate(hashes) if fingerprint in known]
            # No overlap means reset/rollover: retain history provenance, never call it live.
            offset = matches[-1] + 1 if matches else 0
        else:
            legacy_offset = int(cursor)
            offset = legacy_offset if 0 <= legacy_offset <= count else 0
        events: list[PolledHardwareEvent] = []
        for index, record in enumerate(attendance[offset:], start=offset):
            occurred_at = record.timestamp
            if occurred_at.tzinfo is None:
                occurred_at = occurred_at.astimezone()
            occurred_at = occurred_at.astimezone(timezone.utc)
            identity = str(record.user_id)
            fingerprint = "|".join([identity, occurred_at.isoformat(), str(record.status), str(record.punch)])
            source_event_id = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
            events.append(
                PolledHardwareEvent(
                    source_event_id=source_event_id,
                    source_identity=f"zk-user:{identity}",
                    device_user_id=identity,
                    occurred_at=occurred_at,
                    details={"status": record.status, "punch": record.punch, "delivery": "recovered", "reportedDeviceTime": record.timestamp.isoformat()},
                )
            )
        return events, next_cursor

    def live_events(self, stop: Event) -> Iterator[PolledHardwareEvent | None]:
        """Use the ZKTeco attendance event subscription for immediate scans.

        Keep one device session open. Some older standalone terminals only
        tolerate one active SDK session and can reject rapid disconnect/reconnect
        cycles for several minutes.
        """
        with self._connection() as connection:
            capture = connection.live_capture(new_timeout=1)
            idle_heartbeats = 0
            try:
                for record in capture:
                    if stop.is_set():
                        connection.end_live_capture = True
                    if record is None:
                        idle_heartbeats += 1
                        # A socket receive timeout also looks like an idle gym.
                        # Actively ask the terminal for its clock so power loss,
                        # a broken cable, and a wedged protocol session are all
                        # detected without waiting for the next member scan.
                        if idle_heartbeats >= 2 and not stop.is_set():
                            connection.get_time()
                            idle_heartbeats = 0
                        yield None
                        continue
                    idle_heartbeats = 0
                    occurred_at = record.timestamp
                    if occurred_at.tzinfo is None:
                        occurred_at = occurred_at.astimezone()
                    occurred_at = occurred_at.astimezone(timezone.utc)
                    identity = str(record.user_id)
                    fingerprint = "|".join(
                        [identity, occurred_at.isoformat(), str(record.status), str(record.punch)]
                    )
                    yield PolledHardwareEvent(
                        source_event_id=hashlib.sha256(fingerprint.encode("utf-8")).hexdigest(),
                        source_identity=f"zk-user:{identity}",
                        device_user_id=identity,
                        occurred_at=occurred_at,
                        details={"status": record.status, "punch": record.punch, "delivery": "live"},
                    )
            finally:
                connection.end_live_capture = True
