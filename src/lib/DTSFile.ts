import {ClassDeclaration, IndentationText, Node, Project, ProjectOptions, QuoteKind, SourceFile, Symbol, SyntaxKind, ts, Type} from 'ts-morph';
import {TSUtility, Utility} from './Utility';

export interface IExportInfo {
  file: string;
  exports: string[];
}

class DTSProject {
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
  }

  addHandlerSourceFiles(files: string[]) {
    this.handlerFiles_ = files;
    this.sourceProject_.addSourceFilesAtPaths(files);
  }

  addDatabaseSourceFiles(files: string[]) {
    this.databaseFiles_ = files;
    this.sourceProject_.addSourceFilesAtPaths(files);
  }

  addExtraEnumFiles(exportInfoList: IExportInfo[]) {
    for (const info of exportInfoList) {
      this.exportInfoMap_.set(info.file, info.exports);
    }
    this.sourceProject_.addSourceFilesAtPaths(exportInfoList.map(info => info.file));
  }

  generateDeclartionFile() {
    const result = this.sourceProject_.emitToMemory({emitOnlyDtsFiles: true});

    for (const file of result.getFiles()) {
      this.dtsProject_.createSourceFile(Utility.convertDTSFileToTSFile(file.filePath), file.text, {overwrite: true});
    }

    const handlerSources = this.dtsProject_.getSourceFiles(this.handlerFiles_);
    const databaseSources = this.dtsProject_.getSourceFiles(this.databaseFiles_);

    const databaseClasses = [];
    for (const source of databaseSources) {
      const classes = source.getClasses();
      for (const databaseClass of classes) {
        databaseClasses.push(this.modifyDatabaseClass(databaseClass));
      }
    }

    for (const database of databaseClasses) {
      this.addNode(database);
    }

    for (const node of databaseClasses) {
      this.addNodeDependence(node);
    }

    for (const source of handlerSources) {
      const classes = source.getClasses();
      for (const classInFile of classes) {
        const baseClass = TSUtility.getClassRootClass(classInFile);
        if (baseClass.getSourceFile().getFilePath().endsWith('/dist/lib/rpc/Route.d.ts')) {
          this.addHandlerClass(classInFile);
        }
      }
    }

    for (const [filePath, exportList] of [...this.exportInfoMap_]) {
      const source = this.dtsProject_.getSourceFile(filePath);
      for (const symbol of source.getExportSymbols()) {
        if (exportList.includes(symbol.getName())) {
          this.addSymbolDeclaration(symbol);
        }
      }
    }

    const declarationLine = new Set();
    return this.finalNodes_.filter(node => {
      if (node.wasForgotten())
        return false;

      const key = `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}}`;
      if (declarationLine.has(key))
        return false;
      declarationLine.add(key);
      return true;
    }).map(node => node.getText()).join('\n');

    // return this.finalNodes_.filter(node => !node.wasForgotten()).map(node => `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}\n${node.getText()}`).join('\n');
  }

  private pushFinalNode(node: Node) {
    if (this.pushedFinalSymbols_.has(node.getSymbol().compilerSymbol)) {
      return false;
    }

    // const filePath = `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}`;
    // if (this.declaredFileLines_.has(filePath)) {
    //   return false;
    // }
    // this.declaredFileLines_.add(filePath);

    this.pushedFinalSymbols_.add(node.getSymbol().compilerSymbol);
    this.finalNodes_.push((node as any).setIsExported(true));
    if (Node.isEnumDeclaration(node)) {
      node.setHasDeclareKeyword(false);
    }
    return true;
  }

  private addSymbolDeclaration(symbol: Symbol) {
    if (this.pushedDeclarationSymbols_.has(symbol.compilerSymbol))
      return;
    this.pushedDeclarationSymbols_.add(symbol.compilerSymbol);

    const libraraies = ['/typescript/lib/', '/@types/node/'];
    for (const declaration of symbol.getDeclarations()) {
      const filePath = declaration.getSourceFile().getFilePath();
      if (libraraies.some((library) => filePath.includes(library))) {
        continue;
      }

      this.addNodeDependence(declaration);

      let pushed = false;
      if (Node.isClassDeclaration(declaration) ||
          Node.isInterfaceDeclaration(declaration) ||
          Node.isTypeAliasDeclaration(declaration) ||
          Node.isEnumDeclaration(declaration)) {

        pushed = this.pushFinalNode(declaration);
      } else if (Node.isFunctionTypeNode(declaration)) {
        const parent = declaration.getParent();
        if (Node.isTypeAliasDeclaration(parent)) {
          pushed = this.pushFinalNode(parent);
        }
      } else if (Node.isEnumMember(declaration)) {
        const parent = declaration.getParent();
        if (Node.isEnumDeclaration(parent)) {
          pushed = this.pushFinalNode(parent);
        }
      }

      // if (pushed)
      //   this.addNodeDependence(declaration);
    }
  }

  private addTypeDeclartion(type: Type) {
    const symbol = type.getAliasSymbol() || type.getSymbol();
    if (!symbol)
      return;
    // symbol.getValueDeclaration
    this.addSymbolDeclaration(symbol);
  }

  private addNode(node: Node) {
    if (Node.isTyped(node)) {
      const typeNode = node.getTypeNode();
      if (typeNode) {
        this.addNodeDependence(typeNode);
      }
    }

    if (Node.isImportTypeNode(node)) {
      const type = node.getType();
      let compiled = `${(type.getSymbol() || type.getAliasSymbol()).getName()}`;
      const typeArguments = node.getTypeArguments();
      if (typeArguments.length) {
        compiled += `<${typeArguments.map((argument) => {
          return argument.getText();
        }).join(',')}>`;
      }

      node.replaceWithText(compiled);
      this.addTypeDeclartion(type);
      return;
    }

    if (Node.isIdentifier(node)) {
      const type = node.getType();
      this.addTypeDeclartion(type);
      return;
    }

    if (Node.isTypeNode(node)) {
      const type = node.getType();
      this.addTypeDeclartion(type);
      const isRawType = !(type.getSymbol() || type.getAliasSymbol());
      if (isRawType && Node.isTypeReference(node)) {
        const typeName = node.getType().getBaseTypeOfLiteralType().getText();
        switch (typeName) {
          case 'number':
          case 'string':
          case 'boolean':
            node.replaceWithText(typeName);
            break;
          default:
            break;
        }
      }
      return;
    }
  }

  private addNodeDependence(node: Node) {
    if (Node.isImportDeclaration(node)) {
      return;
    }

    node.forEachChild(this.addNodeDependence.bind(this));

    this.addNode(node);
  }

  private modifyDatabaseClass(databaseClass: ClassDeclaration) {
    databaseClass.getConstructors().forEach(cons => cons.remove());
    databaseClass.getMethods().forEach(method => method.remove());
    databaseClass.getProperties().forEach(property => {
      if(property.hasModifier(SyntaxKind.PrivateKeyword) || property.hasModifier(SyntaxKind.ProtectedKeyword)) {
        property.remove();
      }
    });
    return databaseClass;
    // this.finalNodes_.push(databaseClass);
    // this.addNodeDependence(databaseClass);
  }

  private addHandlerClass(routeClass: ClassDeclaration) {
    routeClass.getConstructors().forEach(cons => cons.remove());
    routeClass.removeExtends();
    routeClass.getDecorators().forEach(d => d.remove());
    routeClass.getMethods().forEach((method) => {
      if (method.isStatic()) {
        method.remove();
        return;
      }

      if (method.hasModifier(SyntaxKind.PrivateKeyword) || method.hasModifier(SyntaxKind.ProtectedKeyword)) {
        method.remove();
        return;
      }

      method.getParameters().slice(1).forEach(parameter => parameter.remove());
    });
    routeClass.getProperties().forEach(p => p.remove());

    this.finalNodes_.push(routeClass);
    this.addNodeDependence(routeClass);
  }

  private sourceProject_: Project;
  private dtsProject_: Project;

  private handlerFiles_: string[] = [];
  private databaseFiles_: string[] = [];
  private finalNodes_: Node[] = [];
  private pushedFinalSymbols_: Set<ts.Symbol> = new Set();
  private pushedDeclarationSymbols_: Set<ts.Symbol> = new Set();
  private declaredFileLines_: Set<string> = new Set();
  private exportInfoMap_: Map<string, string[]> = new Map();
}

export {DTSProject}
