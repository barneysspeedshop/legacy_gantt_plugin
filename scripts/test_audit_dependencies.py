from datetime import date
import unittest

from audit_dependencies import unaccepted_advisories


URL = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'
ADVISORIES = {URL: {'name': 'picomatch', 'severity': 'high'}}
PACKAGES = {'node_modules/picomatch': {'version': '4.0.7', 'dev': True}}


class AdvisoryPolicyTest(unittest.TestCase):
    def test_reviewed_dev_only_issue_is_narrowly_accepted(self):
        self.assertEqual(unaccepted_advisories(ADVISORIES, PACKAGES, date(2026, 11, 18)), [])

    def test_exception_expires(self):
        self.assertEqual(unaccepted_advisories(ADVISORIES, PACKAGES, date(2026, 12, 2)),
                         [f'picomatch: high {URL}'])

    def test_production_dependency_is_rejected(self):
        packages = {'node_modules/picomatch': {'version': '4.0.7'}}
        self.assertEqual(unaccepted_advisories(ADVISORIES, packages, date(2026, 11, 18)),
                         [f'picomatch: high {URL}'])

    def test_another_advisory_is_rejected(self):
        advisory = {'https://example.com/new-advisory': {'name': 'picomatch', 'severity': 'high'}}
        self.assertEqual(unaccepted_advisories(advisory, PACKAGES, date(2026, 11, 18)),
                         ['picomatch: high https://example.com/new-advisory'])

    def test_another_version_is_rejected(self):
        packages = {'node_modules/picomatch': {'version': '4.0.6', 'dev': True}}
        self.assertEqual(unaccepted_advisories(ADVISORIES, packages, date(2026, 11, 18)),
                         [f'picomatch: high {URL}'])


if __name__ == '__main__':
    unittest.main()
