import * as vscode from 'vscode';
import { GanttSyncClient } from '../sync/client';
import { CrdtEngine } from '../sync/crdt_engine';

export class GanttPanel {
    public static currentPanel: GanttPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _crdtEngine: CrdtEngine;
    private _syncClient: GanttSyncClient;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Initialize Protocol Components
        // Read configuration
        const config = vscode.workspace.getConfiguration('legacyGantt');
        const serverUrl = config.get<string>('serverUrl', 'ws://localhost:8080/ws');
        const tenantId = config.get<string>('tenantId', 'default-tenant');
        const jwtToken = config.get<string>('jvmAuthToken', '');

        this._crdtEngine = new CrdtEngine();
        this._syncClient = new GanttSyncClient(serverUrl, tenantId);
        
        // Connect only if token is present or we have a mechanism to get it
        if (jwtToken) {
            this._syncClient.connect(jwtToken);
        } else {
            console.warn('No JWT Configured. Gantt Sync Client remaining offline.');
        }

        this._update();
        
        this._panel.onDidDispose(() => this.dispose(), null, []);
        
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message: any) => {
                switch (message.command) {
                    case 'updateTask':
                        this._syncClient.sendOperation('UPDATE_TASK', message.payload);
                        return;
                    case 'log':
                        // Forward logs from webview to extension console
                        console.log(`[Webview ${message.level}]`, ...message.args);
                        return;
                }
            },
            null,
            []
        );
    }

    public static render(extensionUri: vscode.Uri) {
        if (GanttPanel.currentPanel) {
            GanttPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'ganttView',
                'Legacy Gantt',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out')]
                }
            );

            GanttPanel.currentPanel = new GanttPanel(panel, extensionUri);
        }
    }

    public dispose() {
        GanttPanel.currentPanel = undefined;
        this._panel.dispose();
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        // Local path to main script run in the webview
        const webviewPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview');
        
        // Base URI for the webview to load resources from
        const baseUri = this._panel.webview.asWebviewUri(webviewPath);
        
        // Path to the Flutter build's index.html
        const indexPath = vscode.Uri.joinPath(webviewPath, 'index.html');

        let indexHtml = '';
        try {
            return `<!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta content="IE=Edge" http-equiv="X-UA-Compatible">
              
              <base href="${baseUri}/">
              
              <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${this._panel.webview.cspSource}; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://www.gstatic.com ${this._panel.webview.cspSource}; img-src 'self' data: blob: ${this._panel.webview.cspSource}; font-src 'self' data: https://fonts.gstatic.com ${this._panel.webview.cspSource}; connect-src 'self' https://fonts.gstatic.com https://www.gstatic.com ${this._panel.webview.cspSource} ws: wss:;">

              <title>Legacy Gantt</title>
              <script>
                // Patch History API to prevent SecurityError in restricted VS Code Webview
                // Flutter Web tries to update the URL to match the route, which fails here.
                (function() {
                    const noop = function() {};
                    window.history.pushState = noop;
                    window.history.replaceState = noop;
                })();

                // Inject VS Code API for the Flutter app to find
                window.vscode = acquireVsCodeApi();

                // Console Forwarding
                (function() {
                    const oldLog = console.log;
                    const oldWarn = console.warn;
                    const oldError = console.error;
                    
                    console.log = function(...args) {
                        oldLog.apply(console, args);
                        window.vscode.postMessage({ command: 'log', level: 'info', args: args });
                    };
                     console.warn = function(...args) {
                        oldWarn.apply(console, args);
                        window.vscode.postMessage({ command: 'log', level: 'warn', args: args });
                    };
                     console.error = function(...args) {
                        oldError.apply(console, args);
                        window.vscode.postMessage({ command: 'log', level: 'error', args: args });
                    };
                })();

                // Error logging
                window.onerror = function(message, source, lineno, colno, error) {
                    console.error('Window Error:', message, source, lineno, colno, error);
                    const root = document.body;
                    const errDiv = document.createElement('div');
                    errDiv.style.color = 'red';
                    errDiv.style.padding = '20px';
                    errDiv.style.backgroundColor = '#fff0f0';
                    errDiv.style.border = '1px solid red';
                    errDiv.innerText = 'Error: ' + message + '\\n' + source + ':' + lineno + ':' + colno + '\\n' + (error ? error.stack : '');
                    root.appendChild(errDiv);
                };
                
                window.addEventListener('unhandledrejection', function(event) {
                    console.error('Unhandled Rejection:', event.reason);
                     const root = document.body;
                    const errDiv = document.createElement('div');
                    errDiv.style.color = 'orange';
                    errDiv.style.padding = '20px';
                    errDiv.style.backgroundColor = '#fff0f0';
                     errDiv.innerText = 'Unhandled Rejection: ' + event.reason;
                    root.appendChild(errDiv);
                });
              </script>
              <!-- Load flutter.js directly instead of bootstrap to control config -->
              <script src="${this._panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewPath, 'flutter.js'))}" defer></script>
            </head>
            <body>
              <script>
                window.addEventListener('load', function(ev) {
                  console.log('Window Loaded. flutter.js should be ready.');
                  
                  // Wait for flutter.js to load
                  if (!window._flutter) {
                      throw new Error('flutter.js failed to load');
                  }
                  
                  console.log('Initializing Flutter Engine with HTML renderer...');
                  
                  // Initialize Flutter with HTML renderer
                  _flutter.loader.loadEntrypoint({
                    serviceWorker: {
                      serviceWorkerVersion: "2272253788", // Optional, helps with caching
                    },
                    onEntrypointLoaded: function(engineInitializer) {
                      console.log('Entrypoint loaded. Initializing engine...');
                      engineInitializer.initializeEngine({
                        renderer: "html" // FORCE HTML RENDERER
                      }).then(function(appRunner) {
                        console.log('Engine initialized. Running app...');
                        appRunner.runApp();
                      });
                    }
                  });
                });
              </script>
            </body>
            </html>`;
        } catch (e) {
            return `<h1>Error loading Gantt Chart</h1><p>${e}</p>`;
        }
    }
}
