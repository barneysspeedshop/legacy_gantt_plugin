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
