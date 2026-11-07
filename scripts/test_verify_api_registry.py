"""Reject stale, partial or version-mismatched native coverage evidence."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('verify_api', Path(__file__).with_name('verify-api-registry.py'))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)

class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        fixture = sorted(verify.EVIDENCE_FIXTURES)[0]
        sources = {}
        for name in verify.EVIDENCE_SOURCES | {fixture}:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('fixed source')
            sources[name] = hashlib.sha256(path.read_bytes()).hexdigest()
        self.report = dict(passed=True, registrySha256='registry', engineVersion='0.20.1',
                           apiIds=['Circle'], renderer='cairo', fixture=fixture, sourceFiles=sources)

    def errors(self, report):
        return verify.validate_native_evidence(report, 'registry', {'Circle'}, '0.20.1', self.root)

    def test_current_evidence(self):
        self.assertEqual(self.errors(self.report), [])

    def test_rejects_partial_failed_and_mismatched_reports(self):
        for key, value in [('passed', False), ('passed', None), ('engineVersion', '0.19.0'),
                           ('registrySha256', 'stale'), ('apiIds', ['unknown']), ('apiIds', {}),
                           ('renderer', 'unknown'), ('fixture', '../../other.py')]:
            with self.subTest(key=key):
                report = copy.deepcopy(self.report)
                report[key] = value
                self.assertTrue(self.errors(report))

    def test_missing_fingerprints(self):
        report = copy.deepcopy(self.report)
        report['sourceFiles'].pop(next(iter(report['sourceFiles'])))
        self.assertTrue(self.errors(report))

    def test_source_and_fixture_changes_invalidate_evidence(self):
        for name in [next(iter(verify.EVIDENCE_SOURCES)), self.report['fixture']]:
            with self.subTest(file=name):
                (self.root / name).write_text('changed source')
                self.assertTrue(any('Source changed' in error for error in self.errors(self.report)))
                (self.root / name).write_text('fixed source')

if __name__ == '__main__':
    unittest.main()
