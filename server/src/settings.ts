import * as os from 'os';

export interface IConfiguration {
    name: string;
    includePath: string[];
    defines: string[];
}

export interface IConfigurations {
    configurations: IConfiguration[];
}

export function propertiesPlatform() {
    switch (os.platform()) {
        case 'darwin': return 'Mac';
        case 'linux': return 'Linux';
        case 'win32': return 'Win32';
        default:
            console.log("Unsupported operating system.");
            return "null";
    }
}

export type SeverityLevel = 'Error' | 'Warning' | 'Information' | 'Hint' | 'None';

export interface CppCheckSeverityMaps {
    error: SeverityLevel;
    warning: SeverityLevel;
    style: SeverityLevel;
    performance: SeverityLevel;
    portability: SeverityLevel;
    information: SeverityLevel;
}

export interface FlexelintSeverityMaps {
    Error: SeverityLevel;
    Warning: SeverityLevel;
    Info: SeverityLevel;
    Note: SeverityLevel;
}

export interface ClangSeverityMaps {
    fatal: SeverityLevel;
    error: SeverityLevel;
    warning: SeverityLevel;
    note: SeverityLevel;
}

// Settings as defined in VS Code.
export interface Settings {
    'codescroll': {
        enable: boolean;
        debug: boolean;
        run: "onSave" | "onType";
        ignoreParseErrors: boolean;

        excludeFromWorkspacePaths: string[];

        // common options, which may be overridden per syntax analyzer
        standard: string[];
        includePaths: string[];
        defines: string[];
        undefines: string[];
        language: "c" | "c++";
        
        clang: {
            enable: boolean;
            executable: string;
            configFile: string;
            severityLevels: ClangSeverityMaps;

            // common options, which may be overridden per syntax analyzer
            standard: string[];
            includePaths: string[];
            defines: string[];
            undefines: string[];
            language: "c" | "c++";

            // special options
            extraArgs: string[] | null;
            warnings: string[] | null;
            pedantic: boolean;
            pedanticErrors: boolean;
            msExtensions: boolean;
            noExceptions: boolean;
            noRtti: boolean;
            blocks: boolean;
            includes: string[] | null;
            standardLibs: string[] | null;
        }
    };
}
