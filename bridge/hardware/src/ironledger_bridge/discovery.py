from __future__ import annotations

import hashlib
import ipaddress
import re
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from threading import Event
from typing import Callable, Iterable

from .adapters.zk_standalone import ZKStandaloneAdapter
from .models import DeviceConnectionState


@dataclass(frozen=True, slots=True)
class DiscoveredZKDevice:
    address: str
    port: int
    device_id: str
    name: str
    serial_number: str | None
    model: str | None
    firmware_version: str | None
    details: dict[str, object]


PortProbe = Callable[[str, int, float], bool]
IdentityProbe = Callable[[str, int, int], DiscoveredZKDevice | None]


def local_private_ipv4_addresses() -> tuple[str, ...]:
    """Return private, non-link-local addresses without shelling out or needing internet."""
    candidates: set[str] = set()
    preferred: list[str] = []
    for name in {socket.gethostname(), socket.getfqdn()}:
        try:
            candidates.update(
                item[4][0]
                for item in socket.getaddrinfo(name, None, socket.AF_INET, socket.SOCK_DGRAM)
            )
        except OSError:
            continue

    # UDP connect chooses a local route but sends no packet. It helps on Windows
    # machines whose hostname resolves only to loopback.
    for route_hint in ("192.0.2.1", "198.51.100.1"):
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            probe.connect((route_hint, 9))
            routed_address = str(probe.getsockname()[0])
            candidates.add(routed_address)
            preferred.append(routed_address)
        except OSError:
            pass
        finally:
            probe.close()

    usable: list[str] = []
    for value in candidates:
        try:
            address = ipaddress.ip_address(value)
        except ValueError:
            continue
        if address.version != 4 or not address.is_private or address.is_loopback or address.is_link_local:
            continue
        usable.append(str(address))
    preferred_usable = [value for value in preferred if value in usable]
    remaining = sorted(
        set(usable).difference(preferred_usable),
        key=lambda value: int(ipaddress.ip_address(value)),
    )
    return tuple(dict.fromkeys([*preferred_usable, *remaining]))


def discovery_hosts(local_addresses: Iterable[str], max_hosts: int = 512) -> tuple[str, ...]:
    """Scan at most the local /24 for each active address, never a broad corporate network."""
    if max_hosts < 1:
        return ()
    ordered_local = list(dict.fromkeys(str(ipaddress.ip_address(value)) for value in local_addresses))
    local = set(ordered_local)
    networks = list(
        dict.fromkeys(ipaddress.ip_network(f"{value}/24", strict=False) for value in ordered_local)
    )
    hosts: list[str] = []
    for network in networks:
        for address in network.hosts():
            value = str(address)
            if value in local:
                continue
            hosts.append(value)
            if len(hosts) >= max_hosts:
                return tuple(hosts)
    return tuple(hosts)


def _tcp_port_open(address: str, port: int, timeout_seconds: float) -> bool:
    try:
        with socket.create_connection((address, port), timeout=timeout_seconds):
            return True
    except OSError:
        return False


def _device_slug(serial_number: str | None, address: str, port: int) -> str:
    identity = serial_number or f"{address}:{port}"
    label = re.sub(r"[^a-z0-9]+", "-", identity.lower()).strip("-") or "device"
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:8]
    return f"zk-{label[:24]}-{digest}"


def _probe_zk_identity(address: str, port: int, timeout_seconds: int) -> DiscoveredZKDevice | None:
    adapter = ZKStandaloneAdapter(
        address=address,
        port=port,
        timeout=timeout_seconds,
        force_udp=False,
        omit_ping=True,
    )
    health = adapter.health()
    if health.state != DeviceConnectionState.ONLINE:
        return None
    details = dict(health.details)
    serial = str(details.get("serialNumber") or "").strip() or None
    model = str(details.get("model") or "").strip() or None
    firmware = str(details.get("firmwareVersion") or "").strip() or None
    return DiscoveredZKDevice(
        address=address,
        port=port,
        device_id=_device_slug(serial, address, port),
        name=model or "ZKTeco access device",
        serial_number=serial,
        model=model,
        firmware_version=firmware,
        details=details,
    )


def discover_zk_devices(
    *,
    local_addresses: Iterable[str] | None = None,
    port: int = 4370,
    connect_timeout_seconds: float = 0.2,
    protocol_timeout_seconds: int = 2,
    max_hosts: int = 512,
    workers: int = 48,
    max_identity_candidates: int = 64,
    identity_workers: int = 16,
    stop: Event | None = None,
    port_probe: PortProbe = _tcp_port_open,
    identity_probe: IdentityProbe = _probe_zk_identity,
) -> list[DiscoveredZKDevice]:
    """Find TCP ZKTeco terminals and verify each with a read-only protocol handshake."""
    stop = stop or Event()
    addresses = local_private_ipv4_addresses() if local_addresses is None else local_addresses
    hosts = discovery_hosts(addresses, max_hosts)
    if not hosts or stop.is_set():
        return []

    open_hosts: list[str] = []
    executor = ThreadPoolExecutor(max_workers=max(1, min(workers, len(hosts))))
    try:
        futures = {
            executor.submit(port_probe, host, port, connect_timeout_seconds): host
            for host in hosts
        }
        for future in as_completed(futures):
            if stop.is_set():
                break
            try:
                if future.result():
                    open_hosts.append(futures[future])
            except Exception:
                continue
    finally:
        executor.shutdown(wait=True, cancel_futures=stop.is_set())

    identity_hosts = sorted(open_hosts, key=lambda value: int(ipaddress.ip_address(value)))[
        :max(0, max_identity_candidates)
    ]
    if not identity_hosts or stop.is_set():
        return []

    discovered: list[DiscoveredZKDevice] = []
    executor = ThreadPoolExecutor(max_workers=max(1, min(identity_workers, len(identity_hosts))))
    try:
        futures = {
            executor.submit(identity_probe, host, port, protocol_timeout_seconds): host
            for host in identity_hosts
        }
        for future in as_completed(futures):
            if stop.is_set():
                break
            try:
                candidate = future.result()
            except Exception:
                candidate = None
            if candidate is not None:
                discovered.append(candidate)
    finally:
        executor.shutdown(wait=True, cancel_futures=stop.is_set())
    return sorted(discovered, key=lambda item: int(ipaddress.ip_address(item.address)))
