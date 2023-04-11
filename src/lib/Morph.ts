import {ClassDeclaration, Project, ProjectOptions, SourceFile, Node, InterfaceDeclaration, TypeNode, Type, Symbol, Decorator, TypeReferenceNode} from 'ts-morph';
import * as ts from 'typescript';

const LIB_PATH = 'node_modules/typescript'

class Morph {
  constructor(options: ProjectOptions) {
    this.project_ = new Project(options);
    this.distFile_ = this.project_.createSourceFile('test.d.ts');
    // project.
  }

  addHandlerSourceFiles(files: string[]) {
    this.handlerFiles_ = files;
    this.project_.addSourceFilesAtPaths(files);
  }

  addDatabaseSourceFiles(files: string[]) {
    this.databaseFiles_ = files;
    this.project_.addSourceFilesAtPaths(files);
  }

  addServiceNameSourceFile(file: string, name: string) {
    this.serviceNameFile_ = file;
    this.serviceNameEnumName_ = name;
    this.project_.addSourceFilesAtPaths([file]);
  }

  addUserErrorCodeSourceFile(file: string, name: string) {
    this.userErrorCodeEnumName_ = name;
    this.userErrorCodeFile_ = file;
    this.project_.addSourceFileAtPath(file);
  }

  analysisServiceNameEnum() {
    if (!this.serviceNameFile_)
      return;

    const enumSourceFile = this.project_.getSourceFile(this.serviceNameFile_);
    for (const [name, declarations] of enumSourceFile.getExportedDeclarations().entries()) {
      if (name === this.serviceNameEnumName_) {
        declarations.forEach((declaration) => {
          this.addDeclaration(declaration);
        });
      }
    }
  }

  analysisUserErrorCodeEnum() {
    if (!this.userErrorCodeFile_)
      return;

    const enumSourceFile = this.project_.getSourceFile(this.userErrorCodeFile_);
    for (const [name, declarations] of enumSourceFile.getExportedDeclarations().entries()) {
      if (name === this.userErrorCodeEnumName_) {
        declarations.forEach((declaration) => {
          this.addDeclaration(declaration);
        });
      }
    }
  }

  analysisDatabaseClass() {
    if (!this.databaseFiles_.length)
      return;
    const databaseSources = this.project_.getSourceFiles(this.databaseFiles_);

    for (const source of databaseSources) {
      const classes = source.getClasses();
      for (const dataClass of classes) {
        this.addTypeReference(dataClass.getType());
      }
    }

    for (const source of databaseSources) {
      const classes = source.getClasses();
      for (const dataClass of classes) {
        const baseClass = dataClass.getBaseClass();
        if (baseClass) {
          this.addType(baseClass.getType());
        }
        const newClass = this.distFile_.addClass({
          name: dataClass.getName(),
          hasDeclareKeyword: true,
          isExported: true,
          extends: baseClass ? dataClass.getBaseClass().getName() : null,
        });
        this.pushDataClass(dataClass, newClass);
      }
      for (const dataClass of classes) {
        this.addReference(dataClass);
      }
    }
  }

  analysisRouteClass() {
    if (!this.handlerFiles_.length)
      return;
    const handlerSources = this.project_.getSourceFiles(this.handlerFiles_);
    for (const source of handlerSources) {
      const classes = source.getClasses();
      for (const routeClass of classes) {
        const newClass = this.distFile_.addClass({
          name: routeClass.getName(),
          hasDeclareKeyword: true,
          isExported: true,
        });
        this.pushRouteClass(routeClass, newClass);
      }
    }
  }

  generateDistFile() {
    return Buffer.from(this.distFile_.getText());
  }

  private addDeclaration(declaration: Node) {
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

      if (Node.isTypeReference(node)) {
        const type = node.getType();
        const symbol = type.getSymbol() || type.getAliasSymbol();
        if (!symbol) {
          node.replaceWithText(type.getText());
        }
      }

    });

    this.distFile_.addStatements(declaration.getText());
  }

  private addAliasType(name: string, type: string) {
    if (!name || !type)
      return;

    this.distFile_.addStatements(`export type ${name} = ${type}`);
  }

  private addTypeReference(type: Type) {
    const symbol = type.getSymbol() || type.getAliasSymbol();

    if (symbol) {
      this.exitedSymbols_.add(symbol.compilerSymbol);

      let typeText = type.getText();
      if (typeText.startsWith('typeof '))
        typeText = typeText.slice('typeof '.length);
      this.exitedTypeTexts_.add(typeText);
    }
  }

  private addType(type: Type) {
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
          this.addAliasType(type.getText(), declaration.getText());
        } else {
          this.addDeclaration(declaration);
        }

        this.addReference(declaration);
      }
    }
  }

  private addReference(node: Node) {
    if (!node)
      return;
    if (node.getSourceFile().getFilePath().includes(LIB_PATH))
      return;

    // if (Node.isTypedNode(node) || Node.isIdentifier(node)) {
    if (Node.isTyped(node)) {
      const typeNode = node.getTypeNode();
      if (Node.isTypeReference(typeNode)) {
        const type = node.getType();
        this.addType(type);
      }
    } else if (Node.isTypeReference(node)) {
      const type = node.getType();
      this.addType(type);
    } else if (Node.isHeritageClause(node)) {
      const typeNodes = node.getTypeNodes();
      for (const typeNode of typeNodes) {
        const type = typeNode.getType();
        this.addType(type);
      }
    } else if (Node.isReturnTyped(node)) {
      const type = node.getReturnType();
      this.addType(type);
    }
    node.forEachChildAsArray().forEach((child) => {
      if (child.getKind() === ts.SyntaxKind.Decorator)
        return;

      this.addReference(child);
    });
    return;
  }

  private getType(typeNode: Node, addReference = true) {
    if (addReference) {
      this.addReference(typeNode);
    }
    const symbol = this.project_.getTypeChecker().getTypeAtLocation(typeNode);
    return this.project_.getTypeChecker().compilerObject.typeToString(symbol.compilerType);
  }

  private getTypeText(type: Type) {
    return this.project_.getTypeChecker().compilerObject.typeToString(type.compilerType);
  }

  private pushRouteClass(routeClass: ClassDeclaration, newClass: ClassDeclaration) {
    const methods = routeClass.getInstanceMethods();
    for (const method of methods) {
      if (method.hasModifier(ts.SyntaxKind.PrivateKeyword) || method.hasModifier(ts.SyntaxKind.ProtectedKeyword))
        continue;

      const returnTypeNode = method.getReturnTypeNode();
      this.addReference(returnTypeNode);

      newClass.addMethod({
        typeParameters: method.getTypeParameters().map(v => v.getText()),
        name: method.getName(),
        parameters: method.getParameters().slice(0, 1).map((param) => {
          const typeNode = param.getTypeNode();
          return {
            name: param.getName(),
            type: this.getType(typeNode),
          }
        }),
        returnType: returnTypeNode ? this.getType(returnTypeNode) : this.getTypeText(method.getReturnType()),
      });
    }

    const baseClass = routeClass.getBaseClass();
    if (baseClass) {
      this.pushRouteClass(baseClass, newClass);
    }
  }

  private pushDataClass(dataClass: ClassDeclaration, newClass: ClassDeclaration, isSub = false) {
    const properties = dataClass.getInstanceProperties();

    for (const property of properties) {
      if (property.hasModifier(ts.SyntaxKind.PrivateKeyword) || property.hasModifier(ts.SyntaxKind.ProtectedKeyword))
        continue;

      newClass.addProperty({
        name: property.getName(),
        type: this.getType(property, false)
      });
    }
  }

  private project_: Project;
  private handlerFiles_: string[];
  private databaseFiles_: string[];
  private serviceNameEnumName_: string;
  private serviceNameFile_: string;
  private userErrorCodeEnumName_: string;
  private userErrorCodeFile_: string;
  private distFile_: SourceFile;
  private exitedSymbols_: Set<ts.Symbol> = new Set();
  private exitedTypeTexts_: Set<string> = new Set();
}

export {Morph}
