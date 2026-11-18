#!/usr/bin/env python3
"""Fail closed on npm advisories, apart from the reviewed, expiring lint-only exception."""
from datetime import date
import json
from pathlib import Path
import subprocess
import sys


def unaccepted_advisories(advisories, packages, today):
    picomatch = [p for n, p in packages.items() if n.endswith('/picomatch')]
    reviewed = (today < date(2026, 12, 2) and picomatch
                and all(p.get('dev') and p['version'] == '4.0.7' for p in picomatch))
    failures = []
    for url, advisory in advisories.items():
        if (url == 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'
                and advisory['name'] == 'picomatch' and advisory['severity'] == 'high' and reviewed):
            continue
        failures.append(f"{advisory['name']}: {advisory['severity']} {url}")
    return failures


def main():
    root = Path(__file__).resolve().parent.parent
    result = subprocess.run(['npm', 'audit', '--json', '--ignore-scripts'], cwd=root,
                            capture_output=True, text=True)
    data = json.loads(result.stdout)
    if result.returncode not in (0, 1) or data.get('error') or 'vulnerabilities' not in data:
        print('npm advisory lookup failed; verification is incomplete')
        return 1
    lock = json.loads((root / 'package-lock.json').read_text())
    advisories = {a['url']: a for v in data['vulnerabilities'].values()
                  for a in v['via'] if isinstance(a, dict)}
    failures = unaccepted_advisories(advisories, lock['packages'], date.today())
    if len(failures) < len(advisories):
        print('Known lint-only picomatch ReDoS: no upstream fix; exception expires 2026-12-02')
    for failure in failures:
        print(failure)
    print(f'{len(advisories)} distinct advisories; {len(failures)} unaccepted')
    return bool(failures)


if __name__ == '__main__':
    sys.exit(main())
