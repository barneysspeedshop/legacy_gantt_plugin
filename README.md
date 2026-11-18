# Legacy Gantt Plugin

A prototype VS Code extension for the Gantt-Sync Protocol, released under MIT.

The extension host still uses the older JSON wire format, while the current
server uses binary Protobuf. The Flutter webview displays mock data. Production
server synchronization is not supported by this release.

## Features

- **Gantt Chart Visualization**: View Gantt charts directly in VS Code.
- **Experimental sync host**: Contains a JSON-based HLC, CRDT and Merkle client
  for development; it requires migration before use with the current server.

## How to Run

1.  Open this folder (`legacy_gantt_plugin`) in VS Code.
2.  Press `F5` to launch the **Extension Development Host**.
3.  In the new window, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
4.  Run `Legacy Gantt Plugin: Show Legacy Gantt`.

## Configuration

Currently, the extension connects to a default local server:
- **URL**: `ws://localhost:8080/ws`
- **Tenant**: `default-tenant`

Use offline mock data for UI development. A current Gantt Sync Server is not
compatible with this prototype's JSON client.


## Dependency security

Use `npm ci --ignore-scripts`. The project `.npmrc` disables dependency lifecycle hooks by default; `npm test` explicitly compiles, lints, and runs the sync tests. This extension is marked private for npm publication only; its MIT source and VS Code packaging are unchanged.

From the ecosystem root on Linux, run `python3 scripts/check_plugin_isolated.py` to check dependencies and tests without exposing your workstation home, publishing credentials, Git metadata, or Docker socket. Registry checks have network access; compilation, lint, and tests run without networking. The sandbox copies tracked files, so stage intended changes before using it.

CI checks registry signatures and all npm advisories. The only reviewed exception is [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf): unpatched picomatch 4.0.7 ReDoS in the development-only TypeScript lint chain. The fixed lint command does not accept user-supplied glob patterns, and no picomatch code ships as a production dependency. The exception expires on 2026-12-02 and fails closed on another version, a production dependency, or any other advisory. Replace it when an upstream fix is available; do not add broad audit suppressions.
