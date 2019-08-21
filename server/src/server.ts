import {
    createConnection,
    Diagnostic,
    DiagnosticSeverity,
    ErrorMessageTracker,
    Files,
    IConnection,
    InitializeError,
    InitializeParams,
    InitializeResult,
    IPCMessageReader,
    IPCMessageWriter,
    ResponseError,
    TextDocument,
    TextDocuments,
    Position,
} from 'vscode-languageserver';
import { ExecuteCommandParams, DidChangeConfigurationNotification, WorkspaceFolder } from 'vscode-languageserver-protocol/lib/protocol';
import Uri from 'vscode-uri';
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as _ from "lodash";
import { Settings, IConfiguration, IConfigurations, propertiesPlatform } from './settings';

import { Analyzer } from './analyzer';
import { FileSystem } from 'vscode-languageserver/lib/files';
const glob = require('fast-glob');
const substituteVariables = require('var-expansion').substituteVariables; // no types available

// Create a connection for the server. The connection uses Node's IPC as a transport.
const connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager supports full document sync only.
const documents: TextDocuments = new TextDocuments();

// Does the LS client support the configuration abilities?
let hasConfigurationCapability = false;

// Does the LS client support multiple workspace folders?
let hasWorkspaceFolderCapability = false;

let defaultSettings: Settings;
let globalSettings: Settings;

// A mapping between an opened document and its' workspace settings.
let documentSettings: Map<string, Thenable<Settings>> = new Map();

// Clear the entire contents of TextDocument related caches.
function flushCache() {
    documentSettings.clear();
}

// After the server has started the client sends an initialize request.
connection.onInitialize((params): InitializeResult => {
    let capabilities = params.capabilities;

    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);

    let result: InitializeResult = {
        capabilities: {
            textDocumentSync: documents.syncKind,
            executeCommandProvider: {
                commands: [
                    "codescroll.analyzeActiveDocument",
                    "codescroll.analyzeWorkspace"
                ]
            }
        }
    };

    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
});


connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        flushCache();
    } else {
        globalSettings = <Settings>(change.settings['codescroll'] || defaultSettings);
    }

    // Revalidate all open text documents
    documents.all().forEach(_.bind(analyzeFile, this, _));
});

async function getWorkspaceRoot(resource: string): Promise<string> {
    const resourceUri: Uri = Uri.parse(resource);
    const resourceFsPath: string = resourceUri.fsPath;

    let folders: WorkspaceFolder[] | null = await connection.workspace.getWorkspaceFolders();
    let result: string = "";

    if (folders !== null) {
        // sort folders by length, decending.
        folders = folders.sort((a: WorkspaceFolder, b: WorkspaceFolder): number => {
            return a.uri == b.uri ? 0 : (a.uri.length <= b.uri.length ? 1 : -1);
        });

        // look for a matching workspace folder root.
        folders.forEach(f => {
            const folderUri: Uri = Uri.parse(f.uri);
            const folderFsPath: string = folderUri.fsPath;

            // does the resource path start with this folder path?
            if (path.normalize(resourceFsPath).startsWith(path.normalize(folderFsPath))) {
                // found the project root for this file.
                result = path.normalize(folderFsPath);
            }
        });
    } else {
        // No matching workspace folder, so return the folder the file lives in.
        result = path.dirname(path.normalize(resourceFsPath));
    }

    return result;
}

function getDocumentSettings(resource: string): Thenable<Settings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({ scopeUri: resource });
        documentSettings.set(resource, result);
    }
    return result;
}

export function getCppProperties(cCppPropertiesPath: string, currentSettings: Settings, workspaceRoot: string) {
    try {
        if (fs.existsSync(cCppPropertiesPath)) {
            const cCppProperties: IConfigurations = JSON.parse(fs.readFileSync(cCppPropertiesPath, 'utf8'));
            const platformConfig = cCppProperties.configurations.find(el => el.name == propertiesPlatform());

            if (platformConfig !== undefined) {
                // Found a configuration set; populate the currentSettings
                if (currentSettings['codescroll'].includePaths.length === 0) {
                    currentSettings['codescroll'].includePaths = [];
                    process.env.workspaceRoot = workspaceRoot;
                    process.env.workspaceFolder = workspaceRoot;

                    _.forEach(platformConfig.includePath, (path: string) => {
                        try {
                            let { value, error } = substituteVariables(path, { env: process.env });
                            let globbed_path = glob.sync(value, { cwd: workspaceRoot, dot: true, onlyDirectories: true, unique: true, absolute: true });

                            // console.log("Path: " + path + "  VALUE: " + value + "  Globbed is: " + globbed_path.toString());

                            currentSettings['codescroll'].includePaths =
                                currentSettings['codescroll'].includePaths.concat(globbed_path);
                        }
                        catch (err) {
                            console.log(err);
                        }
                    });
                }
                if (currentSettings['codescroll'].defines.length === 0) {
                    currentSettings['codescroll'].defines = platformConfig.defines;
                }
            }
        }
    }
    catch (err) {
        console.log("Could not find or parse the workspace c_cpp_properties.json file; continuing...");
    }

    return currentSettings;
}

function getMergedSettings(settings: Settings, workspaceRoot: string) {
    let currentSettings = _.cloneDeep(settings);
    const cCppPropertiesPath = path.join(workspaceRoot, '.vscode', 'c_cpp_properties.json');

    return getCppProperties(cCppPropertiesPath, currentSettings, workspaceRoot);
}

documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
})

documents.onDidSave(async (event) => {
    analyzeFile(event.document);
});

documents.onDidOpen(async (event) => {
    analyzeFile(event.document);
});



async function analyzeFile(textDocument: TextDocument) {
    const tracker: ErrorMessageTracker = new ErrorMessageTracker();
    const fileUri: Uri = Uri.parse(textDocument.uri);
    const filePath: string = fileUri.fsPath;
    const workspaceRoot: string = await getWorkspaceRoot(textDocument.uri);

    if (workspaceRoot === undefined ||
        workspaceRoot === null ||
        filePath === undefined ||
        filePath === null) {
        // lint can only successfully happen in a workspace, not per-file basis

        console.log("Will not analyze a lone file; must open a folder workspace.");

        return;
    }

    if (fileUri.scheme !== 'file') {
        // lint can only lint files on disk.
        console.log(`Skipping scan of non-local content at ${fileUri.toString()}`);

        return;
    }

    // get the settings for the current file.
    let settings = await getDocumentSettings(textDocument.uri);
    settings = await getMergedSettings(settings, workspaceRoot);

    var tmpDocument = tmp.fileSync();
    fs.writeSync(tmpDocument.fd, textDocument.getText());

    const documentLines: string[] = textDocument.getText().replace(/\r/g, '').split('\n');

    

    const relativePath = path.relative(workspaceRoot, filePath);


    console.log(`Performing lint scan of ${filePath}...`);

    let lintOnMask = 0;
    if (settings['codescroll'].run === "onSave") {
        lintOnMask = 1;
        // only run 1
    } else if (settings['codescroll'].run === "onType") {
        lintOnMask = 3;
    }

    connection.console.log(`analyzing...${filePath}`);
    let allDiagnostics: Map<String, Diagnostic[]> = Analyzer.analysis(filePath, documentLines);
    connection.console.log(`finished...defect(${allDiagnostics.keys.length})`);

    tmpDocument.removeCallback();

    _.each(allDiagnostics, (diagnostics, currentFile) => {
        var currentFilePath = path.resolve(currentFile).replace(/\\/g, '/');

        if (path.normalize(currentFilePath).startsWith(path.normalize(workspaceRoot!))) {
            var acceptFile: boolean = true;

            // see if we are to accept the diagnostics upon this file.
            _.each(settings['codescroll'].excludeFromWorkspacePaths, (excludedPath) => {
                var normalizedExcludedPath = path.normalize(excludedPath);

                if (!path.isAbsolute(normalizedExcludedPath)) {
                    // prepend the workspace path and renormalize the path.
                    normalizedExcludedPath = path.normalize(path.join(workspaceRoot!, normalizedExcludedPath));
                }

                // does the document match our excluded path?
                if (path.normalize(currentFilePath).startsWith(normalizedExcludedPath)) {
                    // it did; so do not accept diagnostics from this file.
                    acceptFile = false;
                }
            });

            if (acceptFile) {
                // Windows drive letter must be prefixed with a slash
                if (currentFilePath[0] !== '/') {
                    currentFilePath = '/' + currentFilePath;
                }

                connection.sendDiagnostics({ uri: 'file://' + currentFilePath, diagnostics: [] });
                connection.sendDiagnostics({ uri: 'file://' + currentFilePath, diagnostics });
            }
        }
    });

    // Remove all previous problem reports, when no further exist
    if (!allDiagnostics.hasOwnProperty(relativePath) && !allDiagnostics.hasOwnProperty(filePath)) {
        let currentFilePath = path.resolve(filePath).replace(/\\/g, '/');
        // Windows drive letter must be prefixed with a slash
        if (currentFilePath[0] !== '/') {
            currentFilePath = '/' + currentFilePath;
        }

        connection.sendDiagnostics({ uri: 'file://' + currentFilePath, diagnostics: [] });
    }

    console.log('Completed lint scans...');

    // Send any exceptions encountered during processing to VSCode.
    tracker.sendErrors(connection);
}

function makeDiagnostic(documentLines: string[] | null, msg): Diagnostic {
    let severity = DiagnosticSeverity[msg.severity];

    let line;
    if (documentLines !== null) {
        line = _.chain(msg.line)
            .defaultTo(0)
            .clamp(0, documentLines.length - 1)
            .value();
    } else {
        line = msg.line;
    }

    // 0 <= n
    let column;
    if (msg.column) {
        column = msg.column;
    } else {
        column = 0;
    }

    let message;
    if (msg.message) {
        message = msg.message;
    } else {
        message = "Unknown error";
    }

    let code;
    if (msg.code) {
        code = msg.code;
    } else {
        code = undefined;
    }

    let source;
    if (msg.source) {
        source = msg.source;
    } else {
        source = 'codescroll';
    }

    let startColumn = column;
    let endColumn = column + 1;

    if (documentLines !== null && column == 0 && documentLines.length > 0) {
        let l: string = _.nth(documentLines, line);

        // Find the line's starting column, sans-white-space
        let lineMatches = l.match(/\S/)
        if (lineMatches !== null) {
            startColumn = lineMatches.index;
        }

        // Set the line's ending column to the full length of line
        endColumn = l.length;
    }

    return {
        severity: severity,
        range: {
            start: { line: line, character: startColumn },
            end: { line: line, character: endColumn }
        },
        message: message,
        code: code,
        source: source,
    };
}


connection.onExecuteCommand((params: ExecuteCommandParams) => {
    const tracker = new ErrorMessageTracker();

    if (params.command === 'codescroll.analyzeActiveDocument') {
        (connection.sendRequest('activeTextDocument') as Thenable<TextDocument>)
            .then((activeDocument) => {
                if (activeDocument !== undefined && activeDocument !== null) {
                    let fileUri: Uri = <Uri>(<any>activeDocument.uri);

                    for (const document of documents.all()) {

                        const documentUri = Uri.parse(document.uri);

                        if (fileUri.fsPath === documentUri.fsPath) {
                            try {
                                analyzeFile(document);
                            } catch (err) {
                                // silently ignored
                            }
                        }

                    }
                }
            });
    } 

})

documents.listen(connection);
connection.listen();
