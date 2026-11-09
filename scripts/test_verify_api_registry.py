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
        for name in ['package-lock.json', 'src/studio/core/api-compiler.ts', self.report['fixture']]:
            with self.subTest(file=name):
                (self.root / name).write_text('changed source')
                self.assertTrue(any('Source changed' in error for error in self.errors(self.report)))
                (self.root / name).write_text('fixed source')

    def test_detailed_outcomes_must_support_declared_coverage(self):
        report = copy.deepcopy(self.report)
        report['outcomes'] = [{'apiId':'Circle','status':'verified'}]
        self.assertEqual(self.errors(report), [])
        # Multiple argument cases for one API are permitted and counted once.
        report['outcomes'] *= 2
        self.assertEqual(self.errors(report), [])
        for outcomes in [[], [{'apiId':'Circle','status':'fixture_gap'}],
                         [{'apiId':'Circle','status':'failed'}]]:
            report['outcomes'] = outcomes
            self.assertTrue(self.errors(report))
        report['apiIds'] = []
        report['outcomes'] = [{'apiId':'Circle','status':'fixture_gap'}]
        self.assertEqual(self.errors(report), [])
        report['outcomes'] = [{'apiId':'Circle','status':'failed'}]
        self.assertTrue(self.errors(report))

    def test_rejects_malformed_outcomes_without_crashing(self):
        for outcomes in [None, {}, ['Circle'], [{'apiId':[]}],
                         [{'apiId':'Circle','status':'skipped'}],
                         [{'apiId':'unknown','status':'verified'}]]:
            with self.subTest(outcomes=outcomes):
                report = copy.deepcopy(self.report)
                report['outcomes'] = outcomes
                self.assertTrue(self.errors(report))

    def test_family_smoke_calls_do_not_count_as_coverage(self):
        report = copy.deepcopy(self.report)
        family = dict(passed=True, apiIds=[], cases=[dict(apiId='Circle', status='fixture_gap')])
        report['families'] = [family]
        self.assertTrue(self.errors(report))
        report['apiIds'] = []
        self.assertEqual(self.errors(report), [])
        family['cases'][0]['status'] = 'verified'
        self.assertTrue(self.errors(report))
        report['apiIds'] = family['apiIds'] = ['Circle']
        self.assertEqual(self.errors(report), [])
        del family['cases'][0]['status']
        self.assertTrue(self.errors(report))

if __name__ == '__main__':
    unittest.main()
