import path = require('path');
import {ClassDeclaration, Decorator, EnumDeclaration, ExportedDeclarations, Expression, IndentationText, Node, Project, ProjectOptions, QuoteKind, SourceFile, Symbol, ts, Type, TypeAliasDeclaration, VariableDeclaration, VariableStatement} from 'ts-morph';
import {Utility} from './Utility';
const LIB_PATH = 'node_modules/typescript'

export interface IExportInfo {
  file: string;
  exports: string[];
}

class TSFile {
  constructor(options: ProjectOptions, srcRootDir: string) {
    this.sourceProject_ = new Project({
      ...options,
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
        indentationText: IndentationText.TwoSpaces,
      }
    });
    this.dtsProject_ = new Project({
      ...options,
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
        indentationText: IndentationText.TwoSpaces,
      }
    });

    this.fileExportMap_ = new Map();

    this.sourceExportedMap_ = new Map();
    this.exportInfoMap_ = new Map();
    this.nodeModuleImportSource_ = new Set();

    this.exitedSymbols_ = new Set();
    this.exitedTypeTexts_ = new Set();

    this.sourceRoot_ = srcRootDir;
  }

  addHandlerSourceFiles(files: string[]) {
    this.handlerFiles_ = files;
    this.sourceProject_.addSourceFilesAtPaths(files);
  }

  addDatabaseSourceFiles(files: string[]) {
    this.databaseFiles_ = files;
    this.sourceProject_.addSourceFilesAtPaths(files);
  }

  addExtraSourceFiles(exportInfoList: IExportInfo[]) {
    for (const info of exportInfoList) {
      this.exportInfoMap_.set(info.file, info.exports);
    }
    this.sourceProject_.addSourceFilesAtPaths(exportInfoList.map(info => info.file));
  }

  analysis() {
    const handlerSources = this.sourceProject_.getSourceFiles(this.handlerFiles_);
    const handlerFilePathList = handlerSources.map((file) => file.getFilePath());
    const databaseSources = this.sourceProject_.getSourceFiles(this.databaseFiles_);
    const databaseFilePathList = databaseSources.map(f => f.getFilePath());
    const extraSources = this.sourceProject_.getSourceFiles([...this.exportInfoMap_].map(([file]) => file));
    const extraFilePathList = extraSources.map(f => f.getFilePath());

    const result = this.sourceProject_.emitToMemory({emitOnlyDtsFiles: true});

    for (const file of result.getFiles()) {
      const source = this.dtsProject_.createSourceFile(Utility.convertDTSFileToTSFile(file.filePath), file.text, {overwrite: true});
      if (extraFilePathList.includes(source.getFilePath())) {
        this.sourceExportedMap_.set(source, this.exportInfoMap_.get(source.getFilePath()) || []);
      }

      if (databaseFilePathList.includes(source.getFilePath())) {
        const classes = source.getClasses();
        for (const dataClass of classes) {
          dataClass.getConstructors().forEach(cons => cons.remove());
          dataClass.getMethods().forEach(method => method.remove());
        }

        const exportedClasses = classes.map(c => c.getName());
        const cleaned = this.cleanExport(source, exportedClasses);
        this.sourceFileFixUnusedIdentifiers(source);
        const realExported = cleaned.filter((name) => {
          return source.getLocal(name);
        });
        if (realExported.length) {
          source.addExportDeclaration({
            namedExports: realExported
          });
        }
        this.sourceExportedMap_.set(source, [...exportedClasses, ...realExported]);
      }

      if (handlerFilePathList.includes(source.getFilePath())) {
        const classes = source.getClasses();
        for (const routeClass of classes) {
          routeClass.getConstructors().forEach(cons => cons.remove());
          routeClass.removeExtends();
          routeClass.getMethods().forEach((method) => {
            if (method.isStatic()) {
              method.remove();
              return;
            }

            if (method.hasModifier(ts.SyntaxKind.PrivateKeyword) || method.hasModifier(ts.SyntaxKind.ProtectedKeyword)) {
              method.remove();
              return;
            }

            method.getParameters().slice(1).forEach(parameter => parameter.remove());
          });
          routeClass.getProperties().forEach(p => p.remove());
        }

        const exportedClasses = classes.map(c => c.getName());
        const cleaned = this.cleanExport(source, exportedClasses);
        this.sourceFileFixUnusedIdentifiers(source);
        const realExported = cleaned.filter((name) => {
          return source.getLocal(name);
        });
        if (realExported.length) {
          source.addExportDeclaration({
            namedExports: realExported
          });
        }
        this.sourceExportedMap_.set(source, [...exportedClasses, ...realExported]);
      }
    }
  }

  setExport(source: SourceFile) {
    const removed = [];
    source.getExportedDeclarations().forEach((d, key) => {
      d.forEach(ds => {
        if (ds instanceof ClassDeclaration) {
          removed.push(ds.getName());
          ds.setIsExported(true);
        }
        if (ds instanceof EnumDeclaration || ds instanceof TypeAliasDeclaration) {
          ds.setHasDeclareKeyword(false);
        }
      });
    });

    source.getExportDeclarations().forEach((d) => {
      d.getNamedExports().forEach((ex) => {
        if (removed.includes(ex.getName())) {
          ex.remove();
        }
      });
    });
  }

  setAllExport() {
    for (const [sourceFile] of this.fileExportMap_) {
      sourceFile.forEachChildAsArray().forEach((node) => {
        if (Node.isExportableNode(node)) {
          node.setIsExported(true);
        }
      });

      sourceFile.getExportDeclarations().forEach((declaration) => {
        declaration.remove();
      });
    }
  }

  generateDistFile() {
    this.loadAllFile();
    this.cleanAllFileExport();
    this.cleanAllFileUnused();
    this.cleanAllFileExport();
    this.dealNodeModuleImport();
    this.removeAllImport();
    this.setAllExport();
    this.formatCode();

    let result = '';
    for (const [sourceFile] of this.fileExportMap_) {
      this.setExport(sourceFile);
      result += '// ' + path.relative(this.sourceRoot_, sourceFile.getFilePath()).replace(/\\/g, '/') + '\n';
      result += sourceFile.getFullText() + '\n';
    }

    return Buffer.from(result);
  }

  formatCode() {
    this.fileExportMap_.forEach((exports, source) => {
      source.formatText({
        tabSize: 2,
        convertTabsToSpaces: true,
      });
    });
  }

  addUsedSymbol(de: Node<ts.Node>, usedSymbol: Set<any>, usedSymbolIds: Set<number>, iter: Set<any>, filePath: string) {
    const deSymbol = de.getSymbol();
    if (deSymbol) {
      usedSymbol.add(deSymbol);
      usedSymbolIds.add((deSymbol.compilerSymbol as any).id);
    }
    de.forEachDescendantAsArray().forEach(dec => {
      const symbol = dec.getSymbol();
      if (symbol) {
        usedSymbol.add(symbol);
        usedSymbolIds.add((symbol.compilerSymbol as any).id);
        symbol.getDeclarations().forEach(sd => {
          if (sd.getSourceFile().getFilePath() === filePath) {
            if (!iter.has(sd)) {
              iter.add(sd);
              this.addUsedSymbol(sd, usedSymbol, usedSymbolIds, iter, filePath);
            }
          }
        })
      }
      this.addUsedSymbol(dec, usedSymbol, usedSymbolIds, iter, filePath);
    });
  }

  cleanAllFileUnused() {
    this.fileExportMap_.forEach((exports, source) => {
      const usedSymbol = new Set();
      const usedSymbolIds = new Set<number>();
      const iter = new Set();
      const exportsDeclarations = source.getExportedDeclarations();

      exportsDeclarations.forEach((d) => {
        d.forEach((de) => {
          if (source.getFilePath().includes('ChartType.ts')) {
            this.addUsedSymbol(de, usedSymbol, usedSymbolIds, iter, source.getFilePath());
          } else {
            this.addUsedSymbol(de, usedSymbol, usedSymbolIds, iter, source.getFilePath());
          }
        });
      });

      const removeStatement = [];
      source.getStatements().forEach((s) => {
        const symbol = s.getSymbol();
        if (symbol) {
          if (!usedSymbol.has(symbol.getExportSymbol())) {
            removeStatement.push(s);
          }
        }
      });

      for (const statement of removeStatement) {
        statement.remove();
      }
    })
  }

  removeAllImport() {
    this.fileExportMap_.forEach((exports, source) => {
      source.getImportDeclarations().forEach(d => {
        d.remove();
      });
    });
  }

  dealNodeModuleImport() {
    this.nodeModuleImportSource_.forEach(source => {
      source.getImportDeclarations().forEach((d) => {
        const targetSourceFile = d.getModuleSpecifierSourceFile();
        if (targetSourceFile.getFilePath().includes('node_modules')) {
          d.getNamedImports().forEach((namedImport) => {
            const node = namedImport.getNameNode();
            const symbol = node.getSymbolOrThrow().getAliasedSymbolOrThrow();
            this.addSymbol(symbol, source);
          });
          d.remove();
        }
      })
    })
  }

  loadFile(source: SourceFile) {
    source.getImportDeclarations().forEach((d) => {
      const list: string[] = [];
      d.getNamedImports().forEach((name) => {
        list.push(name.getName());
      });
      const targetSourceFile = d.getModuleSpecifierSourceFile();
      if (targetSourceFile && targetSourceFile.getFilePath().includes('node_modules')) {
        this.nodeModuleImportSource_.add(source);
        return;
      }

      if (targetSourceFile) {
        const exited = this.fileExportMap_.has(targetSourceFile);
        this.addFileExport(targetSourceFile, list);
        if (!exited) {
          this.loadFile(targetSourceFile);
        }
      }
    });
  }

  loadAllFile() {
    this.fileExportMap_.clear();
    this.nodeModuleImportSource_.clear();
    for (const [handlerSource, exports] of this.sourceExportedMap_) {
      this.loadFile(handlerSource);
      this.addFileExport(handlerSource, exports);
    }
  }

  cleanAllFileExport() {
    let stop = true;
    do {
      stop = true;
      this.loadAllFile();
      for (const [sourceFile, exportedList] of this.fileExportMap_) {
        const origin = sourceFile.getFullText();
        this.cleanExport(sourceFile, exportedList);
        this.sourceFileFixUnusedIdentifiers(sourceFile);
        if (origin !== sourceFile.getFullText()) {
          stop = false;
        }
      }
    } while(!stop);
  }

  sourceFileFixUnusedIdentifiers(sourceFile: SourceFile) {
    let stop = true;
    do {
      const origin = sourceFile.getText();
      sourceFile.fixUnusedIdentifiers();
      stop = origin === sourceFile.getText();
    } while(!stop);
  }

  cleanExport(sourceFile: SourceFile, need: string[]) {
    const cleaned: Array<string> = [];
    sourceFile.getExportedDeclarations().forEach((d, key) => {
      d.forEach(ds => {
        if (!need.includes(key) && !(ds instanceof SourceFile) && !(ds instanceof Expression) && !(ds instanceof VariableDeclaration)) {
          ds.setIsExported(false)
          cleaned.push(key);
        }
        if (ds instanceof VariableDeclaration) {
          const statement = ds.getParent().getParent();

          if (statement instanceof VariableStatement) {
            statement.setIsExported(false)
            cleaned.push(key);
          }
        }
      });
    });

    sourceFile.getExportDeclarations().forEach((d) => {
      d.getNamedExports().forEach((ex) => {
        if (!need.includes(ex.getName())) {
          cleaned.push(ex.getName());
          ex.remove();
        }
      });
    });

    return cleaned;
  }

  addFileExport(source: SourceFile, exportNames: string[]) {
    if (this.fileExportMap_.has(source)) {
      this.fileExportMap_.get(source).push(...exportNames);
    } else {
      this.fileExportMap_.set(source, exportNames);
    }
  }

  private addReference(node: Node, source: SourceFile) {
    if (!node)
      return;
    if (node.getSourceFile().getFilePath().includes(LIB_PATH))
      return;

    if (Node.isTypedNode(node)) {
      const typeNode = node.getTypeNode();
      if (Node.isTypeReferenceNode(typeNode)) {
        const type = node.getType();
        this.addType(type, source);
      }
    } else if (Node.isTypeReferenceNode(node)) {
      const type = node.getType();
      this.addType(type, source);
    } else if (Node.isHeritageClause(node)) {
      const typeNodes = node.getTypeNodes();
      for (const typeNode of typeNodes) {
        const type = typeNode.getType();
        this.addType(type, source);
      }
    } else if (Node.isReturnTypedNode(node)) {
      const type = node.getReturnType();
      this.addType(type, source);
    }
    node.forEachChildAsArray().forEach((child) => {
      if (child.getKind() === ts.SyntaxKind.Decorator)
        return;

      this.addReference(child, source);
    });
    return;
  }

  private addSymbol(symbol: Symbol, source: SourceFile) {
    if (this.exitedSymbols_.has(symbol.compilerSymbol))
      return;
    this.exitedSymbols_.add(symbol.compilerSymbol);

    for (const declaration of symbol.getDeclarations()) {
      if (declaration.getKind() === ts.SyntaxKind.ComputedPropertyName || declaration.getKind() === ts.SyntaxKind.TypeParameter)
        return;
      if (declaration.getSourceFile().getFilePath().includes(LIB_PATH))
        return;

      this.addDeclaration(declaration, source);

      this.addReference(declaration, source);
    }
  }

  private addType(type: Type, source: SourceFile) {
    const symbol = type.getSymbol() || type.getAliasSymbol();

    if (symbol) {
      if (this.exitedSymbols_.has(symbol.compilerSymbol))
        return;
      this.exitedSymbols_.add(symbol.compilerSymbol);

      let typeText = type.getText();
      if (typeText.startsWith('typeof '))
        typeText = typeText.slice('typeof '.length);
      if (this.exitedTypeTexts_.has(typeText))
        return;
      this.exitedTypeTexts_.add(typeText);

      for (const declaration of symbol.getDeclarations()) {
        if (declaration.getKind() === ts.SyntaxKind.ComputedPropertyName || declaration.getKind() === ts.SyntaxKind.TypeParameter)
          return;
        if (declaration.getSourceFile().getFilePath().includes(LIB_PATH))
          return;

        if (symbol.getName() === '__type') {
          this.addAliasType(type.getText(), declaration.getText(), source);
        } else {
          this.addDeclaration(declaration, source);
        }

        this.addReference(declaration, source);
      }
    }
  }

  private addAliasType(name: string, type: string, source: SourceFile) {
    if (!name || !type)
      return;

    source.addStatements(`export type ${name} = ${type}`);
  }

  private addDeclaration(declaration: Node, source: SourceFile) {
    // TODO: 具体处理哪些不需要...
    if (!declaration.getKindName().includes('Declaration')) {
      return;
    }
    declaration.forEachDescendantAsArray().forEach((node) => {
      if (node.wasForgotten())
        return;

      if (node.getKindName() === 'Decorator') {
        (node as Decorator).remove();
        return;
      }

      if (Node.isTypeReferenceNode(node)) {
        const type = node.getType();
        const symbol = type.getSymbol() || type.getAliasSymbol();
        if (!symbol) {
          node.replaceWithText(type.getText());
        }
      }
    });
    source.addStatements(declaration.getText());
  }

  private sourceProject_: Project;
  private dtsProject_: Project;
  private sourceRoot_: string;
  private handlerFiles_: string[] = [];
  private databaseFiles_: string[] = [];
  private exportInfoMap_: Map<string, string[]>;
  private sourceExportedMap_: Map<SourceFile, string[]>;
  private nodeModuleImportSource_: Set<SourceFile>;
  private fileExportMap_: Map<SourceFile, string[]>;

  private exitedSymbols_: Set<ts.Symbol> = new Set();
  private exitedTypeTexts_: Set<string> = new Set();
}

export {TSFile}
