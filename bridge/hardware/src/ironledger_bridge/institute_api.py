"""Okasha's raw hardware executor. No tenant, attendance or school workflow logic."""
import hmac
import ipaddress
import os
from threading import Lock
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .adapters.zk_standalone import ZKStandaloneAdapter
from .function_catalog import catalog, execute, validate

VERSION = '0.1.0'


def create_app(token, allowed_origins=None, executor=execute, adapter_factory=ZKStandaloneAdapter):
    if not token or len(token) < 32:
        raise ValueError('A local bridge token of at least 32 characters is required')
    app = FastAPI(title='Okasha Hardware Bridge', version=VERSION, docs_url=None, redoc_url=None, openapi_url=None)
    lock = Lock()

    @app.middleware('http')
    async def boundary(request: Request, call_next):
        if request.url.hostname not in {'127.0.0.1', 'localhost', '::1'}:
            return JSONResponse({'error': 'Loopback Host required'}, status_code=403)
        origin = request.headers.get('origin')
        if origin and '*' not in origins and origin not in origins:
            return JSONResponse({'error': 'Origin is not allowed'}, status_code=403)
        if request.url.path != '/health' and request.method != 'OPTIONS':
            if not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
                return JSONResponse({'error': 'Unauthorized bridge request'}, status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        if request.headers.get('access-control-request-private-network') == 'true':
            response.headers['Access-Control-Allow-Private-Network'] = 'true'
        return response

    # Wildcard domain policy requested for this build. Authentication is independent.
    origins = allowed_origins if allowed_origins is not None else ['*']
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'POST'], allow_headers=['Authorization', 'Content-Type'])

    @app.get('/health')
    async def health():
        return {'status': 'ok', 'component': 'hardware', 'apiVersion': 3, 'version': VERSION, 'domainPolicy': 'any' if '*' in origins else 'allowlist'}

    @app.get('/v1/functions')
    async def functions():
        return {'library': 'pyzk', 'functions': catalog()}

    @app.post('/v1/execute')
    async def command(request: Request):
        try:
            if int(request.headers.get('content-length', '0')) > 16 * 1024 * 1024:
                return JSONResponse({'error': 'Request exceeds 16 MiB'}, status_code=413)
            chunks = bytearray()
            async for chunk in request.stream():
                chunks.extend(chunk)
                if len(chunks) > 16 * 1024 * 1024:
                    return JSONResponse({'error': 'Request exceeds 16 MiB'}, status_code=413)
            import json
            body = json.loads(chunks)
            if not isinstance(body, dict) or body.get('component') != 'hardware':
                raise ValueError('A hardware command is required')
            method = body.get('method')
            args = body.get('arguments', {})
            validate(method, args)
            device = body.get('target', {}).get('device', {})
            expected_serial = body.get('target', {}).get('expectedSerial')
            expiry = body.get('target', {}).get('expiresAt')
            if method == 'delete_identity_if_unchanged':
                if not isinstance(expected_serial, str) or not expected_serial.strip() or not isinstance(expiry, str):
                    raise ValueError('Conditional deletion requires expected serial and expiry')
                deadline = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                if deadline.tzinfo is None or datetime.now(timezone.utc) >= deadline:
                    raise ValueError('Conditional deletion expired')
            address = str(ipaddress.ip_address(device.get('address', '')))
            port = device.get('port', 4370)
            key = device.get('commKey', 0)
            timeout = device.get('timeout', 10)
            if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
                raise ValueError('Invalid device port')
            if isinstance(key, bool) or not isinstance(key, int) or not 0 <= key <= 2147483647:
                raise ValueError('Invalid communication key')
            if not isinstance(timeout, int) or not 1 <= timeout <= 60:
                raise ValueError('Timeout must be 1–60 seconds')
            if not isinstance(device.get('forceUdp', False), bool):
                raise ValueError('forceUdp must be a boolean')
            adapter = adapter_factory(address=address, port=port, comm_key=key, timeout=timeout, force_udp=device.get('forceUdp', False))
        except Exception as error:
            return JSONResponse({'error': str(error)[:300]}, status_code=400)
        if not lock.acquire(blocking=False):
            return JSONResponse({'error': 'Executor busy; command was not started'}, status_code=409)
        try:
            if method == 'delete_identity_if_unchanged':
                def preflight(connection):
                    if datetime.now(timezone.utc) >= deadline:
                        raise ValueError('Conditional deletion expired')
                    if str(connection.get_serialnumber()).strip() != expected_serial.strip():
                        raise ValueError('Device serial does not match')
                result = await run_in_threadpool(executor, adapter, method, args, preflight=preflight)
            else:
                result = await run_in_threadpool(executor, adapter, method, args)
            return {'state': 'succeeded', 'result': result}
        except Exception as error:
            return {'state': 'uncertain', 'error': {'message': str(error)[:300]}}
        finally:
            lock.release()

    return app
