import * as vscode from 'vscode';
import * as help from './commands/help'
import {SuperColliderContext} from './context';

export async function activate(context)
{
    const outputChannel = vscode.window.createOutputChannel('supercollider');
    context.subscriptions.push(outputChannel);

    const supercolliderContext = new SuperColliderContext;
    context.subscriptions.push(supercolliderContext);

    // An empty place holder for the activate command, otherwise we'll get an
    // "command is not registered" error.
    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.activate',
        async () => {}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.restart',
        async () => {
        supercolliderContext.dispose();
        await supercolliderContext.activate(context.globalStoragePath, outputChannel, context.workspaceState);
    }));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.bootServer',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.bootServer')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.rebootServer',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.rebootServer')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.killAllServers',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.killAllServers')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.showServerWindow',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.showServerWindow')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.cmdPeriod',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.cmdPeriod')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.showServerMeter',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.showServerMeter')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.showScope',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.showScope')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.showFreqscope',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.showFreqscope')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.dumpNodeTree',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.dumpNodeTree')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.dumpNodeTreeWithControls',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.dumpNodeTreeWithControls')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.showNodeTree',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.showNodeTree')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.startRecording',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.startRecording')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.pauseRecording',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.pauseRecording')}));

    context.subscriptions.push(vscode.commands.registerCommand(
        'supercollider.stopRecording',
        async () => {
            supercolliderContext.executeCommand('supercollider.internal.stopRecording')}));
    

    help.activate(supercolliderContext);

    await supercolliderContext.activate(context.globalStoragePath, outputChannel, context.workspaceState);
}
exports.activate = activate;

function deactivate()
{
}
exports.deactivate = deactivate;