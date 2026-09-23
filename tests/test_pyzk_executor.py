import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('executor', Path(__file__).parent.parent / 'local' / 'pyzk_executor.py')
executor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(executor)


class ExecutorTests(unittest.TestCase):
    def test_catalog_does_not_connect(self):
        def no_connection(*args, **kwargs):
            raise AssertionError('Device must not be contacted')
        result = executor.execute({'catalog': True}, no_connection)
        self.assertTrue(any(f['name'] == 'get_attendance' for f in result['functions']))

    def test_missing_device_and_unknown_function_fail_before_connection(self):
        def no_connection(*args, **kwargs):
            raise AssertionError('Device must not be contacted')
        for name in ['get_attendance', '__dict__']:
            result = executor.execute({'method': name, 'arguments': {}}, no_connection)
            self.assertEqual(result['state'], 'failed')

    def test_executes_raw_command_and_always_disconnects(self):
        class FakeDevice:
            closed = False
            def connect(self): return self
            def get_attendance(self): return [{'user_id': '101'}]
            def disconnect(self): self.closed = True
        device = FakeDevice()
        command = {'method': 'get_attendance', 'arguments': {}, 'target': {'device': {'address': '192.168.1.20'}}}
        result = executor.execute(command, lambda *args, **kwargs: device)
        self.assertEqual(result, {'state': 'succeeded', 'result': [{'user_id': '101'}]})
        self.assertTrue(device.closed)


if __name__ == '__main__':
    unittest.main()
