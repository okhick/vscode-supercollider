import * as vscode from "vscode";
import {MarkdownString,
        Range,
        TextEditor} from "vscode";
import * as uuid from "vscode-languageclient/lib/common/utils/uuid";
import * as vscodelc from "vscode-languageclient/node";
import {
    integer,
    ProtocolRequestType,
    StaticRegistrationOptions,
    TextDocumentLanguageFeature,
    TextDocumentRegistrationOptions,
    WorkDoneProgressOptions,
} from "vscode-languageclient/node";

import {SuperColliderContext} from "../context";

function ensure(target, key)
{
    if (target[key] === void 0)
    {
        target[key] = {};
    }
    return target[key];
}

// These decorators are applied to evaluated regions of code during/after execution.
const evaluateDecorator = vscode.window.createTextEditorDecorationType({
    backgroundColor : "rgba(50, 50, 255, 0.05)",
    isWholeLine : true,
    rangeBehavior : vscode.DecorationRangeBehavior.ClosedClosed,
});

const successDecorator  = vscode.window.createTextEditorDecorationType({
    backgroundColor : "rgba(0, 255, 200, 0.05)",
    isWholeLine : true,
    rangeBehavior : vscode.DecorationRangeBehavior.ClosedClosed,
 });

const errorDecorator    = vscode.window.createTextEditorDecorationType({
    backgroundColor : "rgba(255, 0, 0, 0.05)",
    isWholeLine : true,
    rangeBehavior : vscode.DecorationRangeBehavior.ClosedClosed,
   });

let evaluateUID         = 0;

const configuration     = vscode.workspace.getConfiguration();
const decoratorTimeout  = 5000;

// Start and end execution actions
async function onEndEvaluate(
    textEditor: TextEditor,
    range: Range,
    responseText: string,
    isError: boolean,
    flashDelay: Promise<void>,
    postEvaluateFlashDelay: Promise<void>)
{
    await flashDelay;

    textEditor.setDecorations(evaluateDecorator, []);

    if (isError)
    {
        textEditor.setDecorations(successDecorator, []);
        textEditor.setDecorations(errorDecorator, [
            {
                range : range,
                hoverMessage : new MarkdownString(responseText),
            },
        ]);

        await postEvaluateFlashDelay;

        textEditor.setDecorations(errorDecorator, []);
    }
    else
    {
        textEditor.setDecorations(errorDecorator, []);
        textEditor.setDecorations(successDecorator, [
            {
                range : range,
                hoverMessage : new MarkdownString(responseText),
            },
        ]);

        await postEvaluateFlashDelay;

        textEditor.setDecorations(successDecorator, []);
    }
}

function onStartEvaluate(textEditor: TextEditor, range: Range)
{
    let currentEvaluateUID = ++evaluateUID;

    textEditor.setDecorations(successDecorator, []);
    textEditor.setDecorations(errorDecorator, []);
    textEditor.setDecorations(evaluateDecorator, [
        {
            range : range,
            hoverMessage : "Evaluated the thing",
        },
    ]);

    setTimeout(() => {
        // Execution has timed out, so clear - don't clear if we've had another evaluate in the mean time
        if (evaluateUID == currentEvaluateUID)
        {
            textEditor.setDecorations(evaluateDecorator, []);
        }
    }, decoratorTimeout);

    const decoratorFlashTime = configuration.get<integer>(
        "supercollider.evaluate.flashTime",
        50);
    const evaluateFlashDelay    = new Promise<void>((res, err) => {
        setTimeout(res, decoratorFlashTime);
    });

    const postEvaluateFlashTime = configuration.get<integer>(
        "supercollider.evaluate.postFlashTime",
        600);
    const postEvaluateFlashDelay             = new Promise<void>((res, err) => {
        setTimeout(res, postEvaluateFlashTime);
    });

    return (text: string, isError: boolean) => {
        if (evaluateUID == currentEvaluateUID)
        {
            onEndEvaluate(
                textEditor,
                range,
                text,
                isError,
                evaluateFlashDelay,
                postEvaluateFlashDelay);
        }
    };
}

function currentDocumentSelection()
{
    const activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor)
        return null;

    return activeTextEditor.selection;
}

function currentDocumentLine()
{
    const activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor)
        return null;

    let selection = activeTextEditor.selection;
    let startLine = activeTextEditor.document.lineAt(selection.start);
    let endLine   = activeTextEditor.document.lineAt(selection.end);
    let range     = new Range(startLine.range.start, endLine.range.end);

    return range;
}

function currentDocumentRegion()
{
    const activeTextEditor = vscode.window.activeTextEditor;
    const document         = activeTextEditor.document;

    if (!activeTextEditor)
        return null;

    let selection = activeTextEditor.selection;
    let startLine = document.lineAt(selection.start);
    let endLine   = document.lineAt(selection.end);

    let startRE   = new RegExp(/^\(\s*(\/\/)?\s*(.*)\s*$/);
    let endRE     = new RegExp(/^\)\s*\;?\s*(\/\/.*)?$/);

    let nestDepth = 1;

    while (!startRE.test(startLine.text))
    {
        if (startLine.lineNumber == 0)
        {
            startLine = null;
            break;
        }
        else
        {
            startLine = document.lineAt(startLine.lineNumber - 1);
        }
    }

    if (startLine !== null)
    {
        while (true)
        {
            if (startRE.test(endLine.text))
            {
                nestDepth++;
            }

            if (endRE.test(endLine.text))
            {
                nestDepth--;
            }

            if (nestDepth == 0)
            {
                break;
            }

            if (endLine.lineNumber == document.lineCount - 1)
            {
                endLine = null;
                break;
            }
            else
            {
                endLine = document.lineAt(endLine.lineNumber + 1);
            }
        }
    }

    if (startLine !== null && endLine !== null)
    {
        let range = new Range(startLine.range.start, endLine.range.end);

        return range;
    }
    else
    {
        return null;
    }
}

interface EvaluateSelectionProvider
{
    evaluateString(
        document: vscode.TextDocument,
        range: Range): vscode.ProviderResult<EvaluateSelectionRequest.EvaluateSelectionResult>;
}

export function registerEvaluateProvider(
    context: SuperColliderContext,
    provider): vscode.Disposable
{
    let subscriptions: vscode.Disposable[] = [];

    subscriptions.push(
        vscode.commands.registerCommand(
            "supercollider.evaluateSelection",
            (inputRange) => {
                const document = vscode.window.activeTextEditor.document;
                let range: Range =
                    inputRange != null
                        ? new vscode.Selection(
                              new vscode.Position(
                                  inputRange["start"]["line"],
                                  inputRange["start"]["character"]),
                              new vscode.Position(
                                  inputRange["end"]["line"],
                                  inputRange["end"]["character"]))
                        : currentDocumentSelection();

                if (range == null || range.isEmpty)
                {
                    range = currentDocumentLine();
                }

                if (range !== null)
                {
                    provider.evaluateString(document, range);
                }
            }));

    subscriptions.push(
        vscode.commands.registerCommand("supercollider.evaluateLine", () => {
            const document = vscode.window.activeTextEditor.document;
            const range    = currentDocumentLine();
            if (range !== null)
            {
                provider.evaluateString(document, range);
            }
        }));

    subscriptions.push(
        vscode.commands.registerCommand("supercollider.evaluateRegion", () => {
            const document = vscode.window.activeTextEditor.document;
            const range    = currentDocumentRegion();
            if (range !== null)
            {
                provider.evaluateString(document, range);
            }
        }));

    return new vscode.Disposable(() => {
        subscriptions.forEach((d) => d.dispose());
    });
}

interface EvaluateSelectionOptions extends WorkDoneProgressOptions
{
}

interface EvaluateSelectionRegistrationOptions extends EvaluateSelectionOptions,
                                                       TextDocumentRegistrationOptions,
                                                       StaticRegistrationOptions
{
}

interface EvaluateSelectionMiddleware
{
}

namespace EvaluateSelectionRequest
{
export const method = "textDocument/evaluateSelection";

export interface EvaluateSelectionParams {
    textDocument: vscodelc.TextDocumentIdentifier;
    sourceCode: string;
}

export interface EvaluateSelectionResult {
    compileError: string|undefined;
    result: string|undefined;
    error: string|undefined;
}

export const type = new ProtocolRequestType<
    EvaluateSelectionParams,
    EvaluateSelectionResult,
    never,
    void,
    EvaluateSelectionRegistrationOptions>(method);
}

async function evaluateString(
    client,
    document: vscode.TextDocument,
    range: Range): Promise<EvaluateSelectionRequest.EvaluateSelectionResult>
{
    const activeTextEditor = vscode.window.activeTextEditor;

    if (!activeTextEditor)
        return;

    const uri           = vscode.Uri.file(document.fileName);
    const docIdentifier = vscodelc.TextDocumentIdentifier.create(uri.toString());

    let finishFunc      = onStartEvaluate(activeTextEditor, range);

    const result        = client.sendRequest(EvaluateSelectionRequest.type, {
        textDocument : docIdentifier,
        sourceCode : activeTextEditor.document.getText(range),
           });

    result.then((result) => {
        if (result.result !== undefined)
        {
            // const prefix = '⇒ ';
            // vscode.window.showInformationMessage(prefix + result.result);
            finishFunc(result.result, false);
        }
        else if (result.compileError !== undefined)
        {
            // const prefix = '⇏ ';
            // vscode.window.showErrorMessage(prefix + result.compileError);
            finishFunc(result.compileError, true);
        }
        else if (result.error !== undefined)
        {
            // const prefix = '⇏ ';
            // vscode.window.showErrorMessage(prefix + result.error);
            finishFunc(result.error, true);
        }
    });

    return result;
}

// @TODO A lot of boilerplate is required to register this as a feature, but in the end we just trigger the commands roughly the same way.
// Is there benefit here, apart from that we can specify client capabilities and pass options back to our client (which we do not do now anyway...)?
export class EvaluateSelectionFeature extends TextDocumentLanguageFeature<
    EvaluateSelectionOptions|boolean,
    EvaluateSelectionRegistrationOptions,
    EvaluateSelectionProvider,
    EvaluateSelectionMiddleware>
{
    _context: SuperColliderContext;

    constructor(client, context: SuperColliderContext)
    {
        super(client, EvaluateSelectionRequest.type);
        this._context = context;
    }
    fillClientCapabilities(capabilities)
    {
        ensure(
            ensure(capabilities, "textDocument"),
            "evaluation")
            .evaluateSelection = true;
    }

    initialize(capabilities, documentSelector)
    {
        const options = this.getRegistrationOptions(
            documentSelector,
            capabilities.executionProvider);
        if (!options)
        {
            return;
        }
        this.register({
            id : uuid.generateUuid(),
            registerOptions : options,
        });
    }

    registerLanguageProvider(): [ vscode.Disposable, EvaluateSelectionProvider ]
    {
        const provider: EvaluateSelectionProvider = {
            evaluateString : (document: vscode.TextDocument, range: Range) => {
                const client                   = this._client;

                const provideEvaluateSelection = (document: vscode.TextDocument,
                                                  range: Range) => {
                    return evaluateString(client, document, range);
                };

                return provideEvaluateSelection(document, range);
            },
        };

        return [ registerEvaluateProvider(this._context, provider), provider ];
    }
}
