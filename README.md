# CODESCROLL for VS Code

A [Visual Studio Code](https://code.visualstudio.com/) extension for CODESCROLL static analysis engine(psionic-storm).

"CODESCROLL for VS Code" is a brand for the personal version of the static analyzer for safer C/C++ programming.

["CODESCROLL(TM)"](https://www.suresofttech.com/en/tool/summary.php) is commercial software for validating and verifying mission-critical software.
but we happy to announce free static analysis engine for VS Code follow by our company's vision "Software for Safe-world".

We hope to use our static analysis engine for a more safe world that programming with highly confident.

## Features

* Code guideline checking - Common mistake checking, rule from MISRA, ISO Standard, CERT, CWE, etc.
* Program Semantic analysis - Program defect checking(for example, Array bounds error, Memory related misused)

## Limitation

* Whole program analysis is limited in this version for UX(whole program analysis needs much more CPU and memory so it is not appropriate user experience while editing code)
* This version only includes the subset of CODESCROLL rulesets(excluded rules are undecidable in limited analysis resource or still arguing in practical use).

## Requirements

* Currently, this extension only supports Windows because of our analyzer engine's limitation.
* But, we have the plan to make port for Linux and Mac also. so please be patient.

## Development Setup

* run `npm install` inside the project root

### Developing the Server

* open VS Code rooted inside the project root.
* run `cd server && npm run test && cd ..` to execute the unit-tests for all linters.
* run `npm run compile` or `npm run watch` to build the server
  and it will compile it into the `client/out` folder.
* to debug press F5 which attaches a debugger to the server.

## License

Copyright (C) Suresoft Technology Inc.
Licensed under the [GPL3 License](https://opensource.org/licenses/GPL-3.0).
