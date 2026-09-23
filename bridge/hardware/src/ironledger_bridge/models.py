from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        use_enum_values=True,
        extra="forbid",
    )


class CredentialType(StrEnum):
    RFID = "rfid"
    FINGERPRINT = "fingerprint"
    FACE = "face"
    PIN = "pin"
    OTHER = "other"


class Direction(StrEnum):
    ENTRY = "entry"
    EXIT = "exit"
    UNKNOWN = "unknown"


class DeviceConnectionState(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"


class EnrollmentState(StrEnum):
    QUEUED = "queued"
    WAITING_FOR_PERSON = "waiting_for_person"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    UNCERTAIN = "uncertain"


class DeviceCreate(ApiModel):
    device_id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    adapter: str = Field(default="zk-standalone", min_length=1, max_length=80)
    transport: str = Field(default="ethernet", min_length=1, max_length=40)
    address: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    comm_key: int = Field(default=0, ge=0)
    endpoint_id: str | None = Field(default=None, max_length=120)
    enabled: bool = True
    poll_seconds: int = Field(default=1, ge=1, le=300)
    options: dict[str, Any] = Field(default_factory=dict)


class DeviceRecord(ApiModel):
    device_id: str
    name: str
    adapter: str
    transport: str
    address: str | None
    port: int | None
    endpoint_id: str | None
    enabled: bool
    poll_seconds: int
    capabilities: list[str] = Field(default_factory=list)
    state: DeviceConnectionState = DeviceConnectionState.UNKNOWN
    last_seen_at: datetime | None = None
    last_checked_at: datetime | None = None
    error: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class HardwareUser(ApiModel):
    device_user_id: str
    uid: int | None = None
    name: str = ""
    privilege: int = 0
    card_number: str | None = None
    group_id: str | None = None


class EnrollmentRequest(ApiModel):
    credential_type: CredentialType
    device_id: str = Field(min_length=1, max_length=120)
    replace: bool = False
    user_name: str | None = Field(default=None, max_length=80)
    device_user_id: str | None = Field(default=None, max_length=30)
    finger_slot: int = Field(default=0, ge=0, le=9)
    card_number: str | None = Field(default=None, max_length=40)
    opaque_reference: str | None = Field(default=None, max_length=500)

    @field_validator("card_number")
    @classmethod
    def card_is_numeric(cls, value: str | None) -> str | None:
        if value is not None and (not value.isdigit() or int(value) < 0):
            raise ValueError("cardNumber must contain only digits")
        return value


class EnrollmentResult(ApiModel):
    opaque_reference: str
    source_identity: str
    device_user_id: str
    details: dict[str, Any] = Field(default_factory=dict)


class EnrollmentJob(ApiModel):
    job_id: str
    state: EnrollmentState
    request: EnrollmentRequest
    created_at: datetime
    updated_at: datetime
    message: str | None = None
    enrollment_id: str | None = None
    result: EnrollmentResult | None = None


class HardwareMatchInput(ApiModel):
    source_event_id: str = Field(min_length=1, max_length=300)
    device_id: str = Field(min_length=1, max_length=120)
    endpoint_id: str | None = Field(default=None, max_length=120)
    opaque_reference: str = Field(min_length=1, max_length=500)
    direction: Direction = Direction.UNKNOWN
    occurred_at: datetime = Field(default_factory=utc_now)


class PolledHardwareEvent(ApiModel):
    source_event_id: str
    source_identity: str
    device_user_id: str
    occurred_at: datetime
    direction: Direction = Direction.UNKNOWN
    endpoint_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class BridgeAccessEvent(ApiModel):
    event_id: str
    sequence: int
    source_event_id: str
    source_identity: str
    device_user_id: str
    device_id: str
    endpoint_id: str | None
    direction: Direction
    occurred_at: datetime
    received_at: datetime
    details: dict[str, Any] = Field(default_factory=dict)


class AdapterHealth(ApiModel):
    state: DeviceConnectionState
    details: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
