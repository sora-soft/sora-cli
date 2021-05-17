import * as ts from 'typescript';
import * as tsutils from 'tsutils/typeguard';
import {ClassDeclaration, Project, SourceFile} from 'ts-morph';

class DTS {
  constructor(program: ts.Program) {
    this.program_ = program;
    this.checker_ = program.getTypeChecker();

    const project = new Project();
    this.distFile_ = project.createSourceFile('');
  }

  generateAPIDeclaration(fileNames: string[]) {
    const classDeclarations: ts.ClassDeclaration[] = [];

    for (const fileName of fileNames) {
      const sourceFile = this.program_.getSourceFile(fileName);

      sourceFile.forEachChild(child => {
        this.visitFileNode(child, classDeclarations);
      });
    }

    return this.generateRouteClassAST(classDeclarations);
  }

  private generateTypeReferenceDeclaration(types: ts.TypeReferenceNode[]) {
    const typesToFind = types.slice(0);
    const addedSymbols = new Set<ts.Symbol>();
    const addedType = new Set<ts.Type>();
    // let content = '';
    while(typesToFind.length) {
      const node = typesToFind.pop();

      const symbol = this.checker_.getSymbolAtLocation(node.typeName);
      const type = this.checker_.getDeclaredTypeOfSymbol(symbol);

      if (this.distFile_.getLocal(node.typeName.getText()))
        continue;

      const typeSymbol = type.getSymbol();
      if (!typeSymbol) {
        this.distFile_.addTypeAlias({
          name: node.typeName.getText(),
          type: this.checker_.typeToString(type),
        });
        // content = `export type ${node.typeName.getText()} = ${this.checker_.typeToString(type)};` + '\n' + content;
        continue;
      }

      if (addedSymbols.has(typeSymbol))
        continue;

      addedSymbols.add(typeSymbol);

      if (this.checker_.typeToString(type) !== node.typeName.getText()) {
        this.distFile_.addTypeAlias({
          name: node.typeName.getText(),
          type: this.checker_.typeToString(type),
        });
        // content = `export type ${node.typeName.getText()} = ${this.checker_.typeToString(type)};` + '\n' + content;
      }

      typeSymbol.getDeclarations().forEach((declaration) => {
        if (declaration.kind === ts.SyntaxKind.ComputedPropertyName || declaration.kind === ts.SyntaxKind.TypeParameter)
          return;

        typesToFind.push(...this.findAllTypeReference(declaration));
        // content = declaration.getText() + '\n' + content;
        // this.distFile_.
      });
    }

    // return content;
  }

  private findAllTypeReference(node: ts.Node) {
    const noNeedToFind = ['Promise', 'Date', 'Array'];

    const result: ts.TypeReferenceNode[] = [];
    if (tsutils.isTypeReferenceNode(node) && !noNeedToFind.includes(node.typeName.getText()))
      this.generateTypeReferenceDeclaration([node]); // result.push(node);

    node.forEachChild((child) => {
      result.push(...this.findAllTypeReference(child));
    });

    return result;
  }

  private generateDataClassDeclaration(classDeclaration: ts.ClassDeclaration, newClass: ClassDeclaration) {
    classDeclaration.members.filter((member) => {
      return tsutils.isPropertyDeclaration(member);
    }).filter((member: ts.PropertyDeclaration) => {
      return !member.modifiers || member.modifiers.every((modify) => {
        const notNeed = [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.StaticKeyword, ts.SyntaxKind.ProtectedKeyword];
        return !notNeed.includes(modify.kind);
      });
    }).forEach((declaration: ts.PropertyDeclaration) => {

      newClass.addProperty({
        name: declaration.name.getText(),
        type: declaration.type ? declaration.type.getText() : 'any',
      });
      this.typeReferences_.push(...this.findAllTypeReference(declaration.type));
    });

    if (classDeclaration.heritageClauses) {
      const parentExpress = classDeclaration.heritageClauses[0].types[0].expression;
      const symbol = this.checker_.getSymbolAtLocation(parentExpress);
      const type = this.checker_.getDeclaredTypeOfSymbol(symbol);

      for (const d of type.getSymbol().getDeclarations()) {
        if (tsutils.isClassDeclaration(d))
          this.generateDataClassDeclaration(d, newClass);
      }
    }
  }

  private generateRouteClassDeclaration(classDeclaration: ts.ClassDeclaration, newClass: ClassDeclaration) {
    classDeclaration.members.filter((member) => {
      return tsutils.isMethodDeclaration(member);
    }).filter((member: ts.MethodDeclaration) => {
      return !member.modifiers || member.modifiers.every((modify) => {
        const notNeed = [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.StaticKeyword, ts.SyntaxKind.ProtectedKeyword];
        return !notNeed.includes(modify.kind);
      });
    }).forEach((declaration: ts.MethodDeclaration) => {
      if (declaration.parameters[0]) {
        this.typeReferences_.push(...this.findAllTypeReference(declaration.parameters[0]));
      }

      if (declaration.type) {
        this.typeReferences_.push(...this.findAllTypeReference(declaration.type));
      }

      newClass.addMethod({
        name: declaration.name.getText(),
        parameters: declaration.parameters.slice(0, 1).map((param) => {
          return {
            name: param.name.getText(),
            type: param.type ? param.type.getText() : 'any',
          }
        }),
        returnType: declaration.type ? declaration.type.getText() : 'any',
      });
    });

    if (classDeclaration.heritageClauses) {
      const parentExpress = classDeclaration.heritageClauses[0].types[0].expression;
      const symbol = this.checker_.getSymbolAtLocation(parentExpress);
      const type = this.checker_.getDeclaredTypeOfSymbol(symbol);

      for (const d of type.getSymbol().getDeclarations()) {
        if (tsutils.isClassDeclaration(d))
          this.generateRouteClassDeclaration(d, newClass);
      }
    }
  }


  private generateRouteClassAST(classDeclarations: ts.ClassDeclaration[]) {
    const sourceFile = this.distFile_;

    for (const classDeclaration of classDeclarations) {
      const newClass = sourceFile.addClass({
        name: classDeclaration.name.getText(),
        hasDeclareKeyword: true,
        isExported: true,
      });

      this.generateRouteClassDeclaration(classDeclaration, newClass);
    }

    return sourceFile.getText();
  }

  private visitFileNode(node: ts.Node, classDeclarations: ts.ClassDeclaration[]) {
    if (tsutils.isClassDeclaration(node) && this.isRouteClass(node)) {
      // nodes.push()
      // this.generateRouteClassAST(node);
      classDeclarations.push(node);
    }
  }

  private isRouteClass(declaration: ts.ClassDeclaration) {
    const baseClass = this.getBaseClass(declaration);
    return baseClass.getSourceFile().fileName.includes('@sora-soft/framework/dist/lib/rpc/Route') && baseClass.name?.getText() === 'Route';
  }

  private getBaseClass(declaration: ts.ClassDeclaration): ts.ClassDeclaration {
    if (!declaration.heritageClauses) {
      return declaration;
    }

    const parentExpress = declaration.heritageClauses[0].types[0].expression;
    const symbol = this.checker_.getSymbolAtLocation(parentExpress);
    const type = this.checker_.getDeclaredTypeOfSymbol(symbol);

    for (const d of type.getSymbol().getDeclarations()) {
      if (tsutils.isClassDeclaration(d))
        return this.getBaseClass(d);
    }

    return declaration;
  }

  private program_: ts.Program;
  private checker_: ts.TypeChecker;
  private typeReferences_: ts.TypeReferenceNode[];
  private distFile_: SourceFile;
}

export {DTS}
