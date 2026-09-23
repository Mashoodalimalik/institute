from fastapi.testclient import TestClient
from ironledger_bridge.institute_api import create_app

TOKEN = 'x' * 64
HEADERS = {'Authorization': 'Bearer ' + TOKEN}


def test_all_domains_accepted_but_token_required():
    client = TestClient(create_app(TOKEN), base_url='http://127.0.0.1')
    for origin in ['https://institute.example', 'https://gymatic.co', 'http://localhost:3000']:
        response = client.get('/v1/functions', headers={**HEADERS, 'Origin': origin})
        assert response.status_code == 200
        assert response.headers['access-control-allow-origin'] == '*'
    assert client.get('/v1/functions', headers={'Origin': 'https://institute.example'}).status_code == 403
    assert client.get('/health', headers={'Host': 'attacker.example'}).status_code == 403
    assert client.get('/health').json()['domainPolicy'] == 'any'


def test_allowlist_can_be_added_later():
    client = TestClient(create_app(TOKEN, ['https://institute.example']), base_url='http://127.0.0.1')
    headers = {'Origin': 'https://other.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type'}
    assert client.options('/v1/execute', headers=headers).status_code == 400
    assert client.get('/v1/functions', headers={**HEADERS, 'Origin': 'https://other.example'}).status_code == 403
    headers['Origin'] = 'https://institute.example'
    assert client.options('/v1/execute', headers=headers).status_code == 200


def test_raw_dispatch_and_invalid_arguments_do_not_contact_device():
    calls = []
    def factory(**kwargs):
        calls.append(kwargs)
        return object()
    def executor(adapter, name, args):
        return {'method': name, 'raw': True}
    client = TestClient(create_app(TOKEN, executor=executor, adapter_factory=factory), base_url='http://127.0.0.1')
    command = {'component': 'hardware', 'method': 'get_attendance', 'arguments': {}, 'target': {'device': {'address': '192.168.1.20'}}}
    result = client.post('/v1/execute', json=command, headers=HEADERS)
    assert result.json() == {'state': 'succeeded', 'result': {'method': 'get_attendance', 'raw': True}}
    assert calls[0]['port'] == 4370
    command['arguments'] = {'arbitrary': 1}
    assert client.post('/v1/execute', json=command, headers=HEADERS).status_code == 400
    assert len(calls) == 1


def test_failures_after_dispatch_are_uncertain():
    def executor(*args):
        raise RuntimeError('Device timed out')
    client = TestClient(create_app(TOKEN, executor=executor, adapter_factory=lambda **kwargs: object()), base_url='http://127.0.0.1')
    response = client.post('/v1/execute', headers=HEADERS, json={'component': 'hardware', 'method': 'get_attendance', 'arguments': {}, 'target': {'device': {'address': '192.168.1.20'}}})
    assert response.json()['state'] == 'uncertain'
