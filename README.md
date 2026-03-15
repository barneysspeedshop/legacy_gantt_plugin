# Legacy Gantt Plugin

A VS Code extension for the Gantt-Sync Protocol.

## Features

- **Gantt Chart Visualization**: View Gantt charts directly in VS Code.
- **Real-time Sync**: Synchronizes changes using the Gantt-Sync Protocol (HLC, CRDT, Merkle).

## How to Run

1.  Open this folder (`legacy_gantt_plugin`) in VS Code.
2.  Press `F5` to launch the **Extension Development Host**.
3.  In the new window, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
4.  Run `Legacy Gantt Plugin: Show Legacy Gantt`.

## Configuration

Currently, the extension connects to a default local server:
- **URL**: `ws://localhost:8080/ws`
- **Tenant**: `tenant-123`

To test synchronization, ensure you have a compatible Gantt Sync Server running locally.
