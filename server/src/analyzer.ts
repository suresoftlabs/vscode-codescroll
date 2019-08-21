import * as which from 'which';
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from 'child_process';
import { isString } from 'util';
import { Diagnostic, DiagnosticSeverity, Position } from 'vscode-languageserver';

export class Analyzer  {
    public static analysis(filePath: string, documentLines:string[]): Map<String, Diagnostic[]> {
        console.log(`analyzing...${path.basename(filePath)}`);
        
        const allDiagnostics: Map<String, Diagnostic[]> = new Map<String, Diagnostic[]>();
            
        let diagnostics: Diagnostic[] = [];
        let error: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
                start: Position.create(0, 0),
                end: Position.create(0, documentLines[0].length)
            },
            message: "결함이 여기 표시됨(!!!***)",
            source: filePath
        };
        error.relatedInformation = [
            {
                location: {
                    uri: 'file://' + this.normalizePath(filePath),
                    range: {
                        start: Position.create(0, 0),
                        end: Position.create(0, 2)
                    }
                },
                message: 'event1'
            },
            {
                location: {
                    uri: 'file://' + this.normalizePath(filePath),
                    range: {
                        start: Position.create(0, 2),
                        end: Position.create(0, 5)
                    }
                },
                message: 'event2'
            }
        ];

        diagnostics.push(error);
        allDiagnostics[filePath] = diagnostics;
        return allDiagnostics;
    }

    private static normalizePath(path: string): string {
        // Windows drive letter must be prefixed with a slash
        if (path[0] !== '/') {
            path = '/' + path;
        }
        return path;
    }
}
