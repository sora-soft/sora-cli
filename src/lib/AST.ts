import * as ts from 'typescript';
import {ScriptFileNode, IChange} from './fs/ScriptFileNode';

class AST {
  constructor(file: ScriptFileNode) {
    this.file_ = file;
    this.printer_ = ts.createPrinter({
      removeComments: false,
    });
  }

  insertEnum(enumName: string, key: string, value: any) {
    const sourceFile = ts.createSourceFile(this.file_.path, this.file_.getContent(), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

    const enumDeclaration = this.getEnumDeclaration(sourceFile, enumName);

    const exited = enumDeclaration.members.some(member => (member.name as ts.Identifier).escapedText === key);
    if (exited)
      throw new Error(`Duplicate enum member defined, key=${key}`);

    const newMember = ts.factory.createEnumMember(key, ts.factory.createStringLiteral(value, true));

    let lastEnd = false;
    if (enumDeclaration.members.length) {
      const lastMember = enumDeclaration.members[enumDeclaration.members.length - 1];
      const afterLastMember = this.file_.getContent().substring(lastMember.end, enumDeclaration.end);
      lastEnd = afterLastMember.includes(',');
    }

    this.file_.modify({
      start: enumDeclaration.members.end,
      end: enumDeclaration.members.end,
      content: `${lastEnd ? '' : ','}\n  ${this.printer_.printNode(ts.EmitHint.Unspecified, newMember, undefined)},`,
    });
  }

  addImport(importName: string, importFrom: string, isDefault = false) {
    const sourceFile = ts.createSourceFile(this.file_.path, this.file_.getContent(), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

    let lastImportDeclaration: ts.ImportDeclaration = null;
    for (const statement of sourceFile.statements) {
      if (statement.kind === ts.SyntaxKind.ImportDeclaration) {
        const importDeclaration = statement as ts.ImportDeclaration;
        lastImportDeclaration = importDeclaration;
        if ((importDeclaration.moduleSpecifier as ts.StringLiteral).text === importFrom) {
          const importElements = ((importDeclaration.importClause as ts.ImportClause).namedBindings as ts.NamedImports).elements;
          const isImported = importElements.some(v => v.name.escapedText === importName);
          if (!isImported) {
            this.file_.modify({
              start: importElements.length ? importElements[importElements.length - 1].pos : importElements.pos,
              end: importElements.length ? importElements[importElements.length - 1].pos : importElements.pos,
              content: `${importElements.length ? ',' : ''} ${importName}`,
            });
            return;
          }
        }
      }
    }

    const importCode = `import ${isDefault ? '' : '{'}${importName}${isDefault ? '' : '}'} from '${importFrom}';`;

    if (!lastImportDeclaration) {
      this.file_.modify({
        start: 0,
        end: 0,
        content: importCode,
      })
    } else {
      this.file_.modify({
        start: lastImportDeclaration.end,
        end: lastImportDeclaration.end,
        content: `\n${importCode}`
      })
    }
  }

  insertCodeInClassMethod(className: string, method: string, code: string) {
    const sourceFile = ts.createSourceFile(this.file_.path, this.file_.getContent(), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

    const classDeclaration = this.getClassDeclaration(sourceFile, className);

    for (const member of classDeclaration.members) {
      if (member.kind === ts.SyntaxKind.MethodDeclaration) {
        const methodDeclaration = member as ts.MethodDeclaration;
        if ((methodDeclaration.name as ts.Identifier).escapedText === method) {
          const body = methodDeclaration.body as ts.Block;

          this.file_.modify({
            start: body.statements.end,
            end: body.statements.end,
            content: code,
          });
          return;
        }
      }
    }
  }

  getEnumStringPair(enumName: string) {
    const sourceFile = ts.createSourceFile(this.file_.path, this.file_.getContent(), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

    const result: {[key: string]: string} = {};

    const enumDeclaration = this.getEnumDeclaration(sourceFile, enumName);
    if (enumDeclaration.name.escapedText === enumName) {
      for (const member of enumDeclaration.members) {
        result[(member.initializer as ts.StringLiteral).text] = (member.name as ts.Identifier).escapedText.toString();
      }
    }

    return result;
  }

  addDatabase(comName: string, componentNameKey: string, databaseName: string) {
    const sourceFile = ts.createSourceFile(this.file_.path, this.file_.getContent(), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

    const classDeclaration = this.getClassDeclaration(sourceFile, comName);
    const propertyDeclaration = classDeclaration.members.filter(mem => mem.kind === ts.SyntaxKind.PropertyDeclaration);

    for (const property of propertyDeclaration as ts.PropertyDeclaration[]) {
      if (property.initializer && property.initializer.kind === ts.SyntaxKind.NewExpression) {
        const initializer = property.initializer as ts.NewExpression;
        if (initializer.arguments) {
          const firstArgument = initializer.arguments[0];
          if (firstArgument.kind === ts.SyntaxKind.PropertyAccessExpression && (firstArgument as ts.PropertyAccessExpression).name.escapedText === componentNameKey) {
            const arrayArguments = initializer.arguments[1] as ts.ArrayLiteralExpression;
            this.file_.modify({
              start: arrayArguments.elements.end,
              end: arrayArguments.elements.end,
              content: `${arrayArguments.elements.length ? ', ' : ''}${databaseName}`
            });
          }
        }
      }
    }
  }

  private getClassDeclaration(sourceFile: ts.SourceFile, className: string) {
    for (const statement of sourceFile.statements) {
      if (statement.kind === ts.SyntaxKind.ClassDeclaration) {
        const classDeclaration = statement as ts.ClassDeclaration;
        if (classDeclaration.name.escapedText === className) {
          return classDeclaration;
        }
      }
    }
    throw new Error('Class declaration not found');
  }

  private getEnumDeclaration(sourceFile: ts.SourceFile, enumName: string) {
    for (const statement of sourceFile.statements) {
      if (statement.kind === ts.SyntaxKind.EnumDeclaration) {
        const enumDeclaration = statement as ts.EnumDeclaration;
        if (enumDeclaration.name.escapedText === enumName) {
          return enumDeclaration;
        }
      }
    }
    throw new Error('Enum declaration not found');
  }

  private file_: ScriptFileNode;
  private printer_: ts.Printer;
}

export {AST}
