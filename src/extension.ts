import * as vscode from 'vscode';
import { GanttPanel } from './panels/GanttPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "legacy-gantt-plugin" is now active!');

    const helloCommand = vscode.commands.registerCommand('legacy-gantt-plugin.showGantt', () => {
        GanttPanel.render(context.extensionUri);
    });

    context.subscriptions.push(helloCommand);
}

export function deactivate() {}
