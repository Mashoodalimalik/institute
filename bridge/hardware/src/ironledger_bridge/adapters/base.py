from __future__ import annotations

from abc import ABC, abstractmethod
from threading import Event
from typing import Iterator

from ..models import AdapterHealth, EnrollmentRequest, EnrollmentResult, HardwareUser, PolledHardwareEvent


class HardwareAdapter(ABC):
    adapter_type: str
    capabilities: frozenset[str]

    @abstractmethod
    def health(self) -> AdapterHealth:
        raise NotImplementedError

    @abstractmethod
    def list_users(self) -> list[HardwareUser]:
        raise NotImplementedError

    @abstractmethod
    def delete_user(self, device_user_id: str) -> HardwareUser:
        """Delete one non-administrator identity and all credentials owned by it."""
        raise NotImplementedError

    @abstractmethod
    def enroll(self, request: EnrollmentRequest) -> EnrollmentResult:
        raise NotImplementedError

    @abstractmethod
    def poll_events(self, cursor: str | None) -> tuple[list[PolledHardwareEvent], str | None]:
        raise NotImplementedError

    def live_events(self, stop: Event) -> Iterator[PolledHardwareEvent | None]:
        """Yield device events as they occur; None is a live-connection heartbeat."""
        raise NotImplementedError("This adapter does not support live events")

    def close(self) -> None:
        return None
