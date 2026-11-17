# AI Agent Instructions for Legacy Gantt Plugin (VS Code Extension)

This directory is a VS Code extension that embeds a Flutter Web Gantt chart as a webview panel. It has two independently-built sub-components that must be understood together.

Release status: experimental prototype. The TypeScript host uses the older JSON
wire format and is incompatible with the current server's binary Protobuf
protocol. The Flutter webview displays mock data. References below to shared
protocol behavior describe the older implementation, not current compatibility.

## 1. Architecture Overview

```
legacy_gantt_plugin/
├── src/                    # TypeScript extension host (Node.js / VS Code API)
│   ├── extension.ts        # Activation entry point — registers showGantt command
│   ├── panels/
│   │   └── GanttPanel.ts   # WebviewPanel lifecycle, message routing, config reading
│   ├── models/
│   │   └── dtos.ts         # Shared data types: Task, Operation, Dependency, Hlc
│   └── sync/
│       ├── client.ts       # GanttSyncClient — WebSocket connection to the server
│       ├── crdt_engine.ts  # CrdtEngine — field-level LWW merge using HLC timestamps
│       ├── hlc.ts          # Hlc class — parse/send/receive/compare
│       └── merkle.ts       # MerkleTree — SHA-256 task hashing and root computation
├── webview_ui/             # Flutter Web app (rendered inside the VS Code webview)
│   └── lib/
│       ├── main.dart           # App entry point, LegacyGanttChartWidget + scrubber
│       ├── js_interop.dart     # Web target: sendTaskToHost() via console.log forwarding
│       └── js_interop_stub.dart # Non-web stub for the same function
└── out/                    # TypeScript compile output (gitignored, must be built)
    └── webview/            # Flutter build output must be copied/built here
```

The extension host runs in Node.js inside VS Code. The Flutter app runs in a sandboxed `WebviewPanel` (Chromium). They communicate exclusively through the VS Code webview message-passing API — there is no shared memory or direct function calls between them.

## 2. Message-Passing Protocol (Extension Host ↔ Webview)

### Host → Webview
The host injects `window.vscode = acquireVsCodeApi()` and a `<base href>` pointing to `out/webview/` before the Flutter app loads. No structured messages are currently sent from host to webview after load — the Flutter app initializes with hardcoded mock data.

### Webview → Host
The Flutter app calls `sendTaskToHost(type, payload)` (defined in `js_interop.dart`), which currently routes through `console.log`. The host intercepts all `console.log`/`warn`/`error` calls via a JavaScript patch injected in the webview HTML and forwards them as structured messages:

```json
{ "command": "log", "level": "info|warn|error", "args": [...] }
```

Task update events from the Gantt widget call `sendTaskToHost('Update <id>', 'UPDATE')`, which arrives at the host as a log message. The host also handles a direct `updateTask` command:

```json
{ "command": "updateTask", "payload": { /* partial Task fields */ } }
```

When received, the host calls `GanttSyncClient.sendOperation('UPDATE_TASK', payload)`, which wraps the payload in a full `Operation` and sends it over WebSocket.

> [!IMPORTANT]
> The `sendTaskToHost` function in `js_interop.dart` currently uses `print()` (console forwarding), not `window.vscode.postMessage()` directly. Any refactor that adds real JS interop must keep the stub in `js_interop_stub.dart` in sync — the file is selected at compile time via a conditional import (`if (dart.library.js_interop) 'js_interop.dart'`).

## 3. WebSocket Sync Protocol

`GanttSyncClient` (`src/sync/client.ts`) connects to the Gantt Sync Server using the `ws` npm package (Node.js WebSocket, not the browser API). This means it **can** send the `Authorization: Bearer <jwt>` header on the upgrade request — unlike browser clients, which cannot set custom WebSocket headers.

Connection flow:
1. `connect(jwt)` — opens WebSocket with `Authorization` header
2. On `open` — sends `{ "type": "subscribe", "channel": "<tenantId>" }`
3. On `message` — updates local HLC via `hlc.receive()`, then dispatches to CRDT engine
4. `sendOperation(type, data)` — advances HLC via `hlc.send()`, wraps in `Operation`, sends JSON

The sync protocol is the same `legacy_gantt_protocol` wire format used by all other clients. Operation types handled by `CrdtEngine`: `UPDATE_TASK`, `DELETE_TASK`, `BATCH_UPDATE`.

## 4. Configuration and Hardcoded Defaults

The extension reads configuration from VS Code settings (`vscode.workspace.getConfiguration('legacyGantt')`):

| Setting key | Default | Description |
|---|---|---|
| `legacyGantt.serverUrl` | `ws://localhost:8080/ws` | WebSocket URL for the Gantt Sync Server |
| `legacyGantt.tenantId` | `default-tenant` | Tenant ID for the subscription channel |
| `legacyGantt.jvmAuthToken` | `""` (empty) | JWT for server auth (dev only) |

> [!IMPORTANT]
> The README says the tenant default is `tenant-123`, but the source (`package.json` contributes section and `GanttPanel.ts`) uses `default-tenant`. The README is wrong. The authoritative defaults are in `package.json` under `contributes.configuration.properties`.

Override these in VS Code settings (`settings.json`) or via the Settings UI under "Legacy Gantt". If `jvmAuthToken` is empty, the WebSocket connection is skipped entirely and the extension runs in offline mode with mock data.

## 5. Build Order

> [!WARNING]
> The Flutter build output must land in `out/webview/` for the extension to serve it. The TypeScript host must be compiled first because it defines the `out/` directory structure that the webview is served from.

**Step 1 — Compile the TypeScript extension host:**
```bash
cd legacy_gantt_plugin
npm install
npm run compile
```
Output goes to `out/`. The webview panel serves files from `out/webview/`.

**Step 2 — Build the Flutter Web app:**
```bash
cd legacy_gantt_plugin/webview_ui
flutter pub get
flutter build web --web-renderer html
```
Output lands in `webview_ui/build/web/`. You must then copy (or symlink) the build output into `out/webview/`:
```bash
cp -r webview_ui/build/web/* ../out/webview/
```

The Flutter app **must** be built with `--web-renderer html`. The `GanttPanel.ts` HTML template explicitly initializes the Flutter engine with `renderer: "html"` — using the CanvasKit renderer will break rendering inside the VS Code webview sandbox.

**Development watch mode:**
```bash
npm run watch   # TypeScript incremental compilation
```
There is no Flutter watch mode for the webview; rebuild manually after Flutter changes.

## 6. Fragile Areas and Invariants

**History API patch** — The webview HTML patches `window.history.pushState` and `window.history.replaceState` to no-ops before Flutter loads. Flutter Web tries to update the URL on route changes, which throws a `SecurityError` in the VS Code webview sandbox. Do not remove this patch.

**Content Security Policy** — The CSP in `GanttPanel._getHtmlForWebview()` explicitly allows `ws:` and `wss:` in `connect-src` for the WebSocket connection. If you add new resource origins (fonts, CDN scripts), you must update the CSP. The CSP also allows `unsafe-eval` and `unsafe-inline` for scripts — required by Flutter Web's HTML renderer.

**`localResourceRoots`** — The webview panel is created with `localResourceRoots: [extensionUri/out]`. Only files under `out/` are accessible to the webview. Flutter build output placed anywhere else will 404.

**HLC format** — The TypeScript `Hlc` class uses the same format as the rest of the monorepo: `<ISO-8601-UTC>-<4-hex-counter>-<nodeId>`. The regex is `/^(.+)-([0-9a-fA-F]{4})-(.+)$/`. Do not change the counter padding (4 hex digits) without updating the Dart implementations in `legacy_gantt_protocol`.

**Merkle hashing** — `MerkleTree.computeTaskHash()` hashes a canonical JSON representation with keys sorted alphabetically (see `stringifyResultIds`). The field set must match the Dart server's Merkle implementation exactly. Adding or removing fields from the hash will cause perpetual full-sync resets.

**CRDT merge** — `CrdtEngine` implements field-level last-write-wins using per-field HLC timestamps stored in `Task.fieldTimestamps`. The merge logic mirrors the Dart client in `legacy_gantt_chart`. Do not change the field merge order or the `shouldUpdate` comparison without updating both implementations.

**Offline mode** — If `jvmAuthToken` is empty, `GanttSyncClient.connect()` is never called. The webview still loads and displays mock data. This is intentional — the extension is usable without a server for UI development.

**`webview_ui` dependencies** — `pubspec.yaml` references `legacy_gantt_chart` and `legacy_timeline_scrubber` via relative paths (`../../legacy_gantt_chart`, `../../legacy_timeline_scrubber`). These packages must be present in the monorepo at those paths for `flutter pub get` to succeed. Do not move the `webview_ui/` directory without updating these path references.
