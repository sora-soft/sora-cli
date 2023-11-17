import {Config} from './Config';
import {FileTree} from './fs/FileTree';
import template = require('art-template');
import {Utility} from './Utility';
import {ScriptFileNode} from './fs/ScriptFileNode';
import {AST} from './AST';
import path = require('path');
import {TSFile} from './TSFile';
import fs = require('fs/promises');
import inquirer = require('inquirer');
import os = require('os');
import {DTSProject} from './DTSFile';

interface IGenerateCommonOptions {
  dryRun?: boolean;
}

interface IGenerateServiceOptions extends IGenerateCommonOptions {
  name: string;
  handlerFilePath: string;
}

interface IGenerateRouteOptions extends IGenerateCommonOptions {
  name: string;
}

interface IGenerateWorkerOptions extends IGenerateCommonOptions {
  name: string;
}

interface IGenerateDatabaseOptions extends IGenerateCommonOptions {
  name: string;
  file: string;
  component?: string;
}

interface IBuildAPIDeclareOptions {
  excludeHandler: string[];
  includeHandler: string[];
  excludeDatabase: string[];
  includeDatabase: string[];
}

interface IGenerateConfigFile {
  template: string;
  dist: string;
}

function buildInquirerByVars(vars: {key: string, type: string, hint: string}[]) {
  const result = [];
  for (const v of vars) {
    const [type, arg] = v.type.split(':');
    switch(type) {
      case 'password':
      case 'number': {
        result.push({
          message: v.hint,
          type: v.type,
          name: v.key,
        });
        break;
      }
      case 'select': {
        const choices = arg.slice(1, -1).split('|');
        result.push({
          message: v.hint,
          type: 'list',
          name: v.key,
          choices,
        })
        break;
      }
      case 'string': {
        result.push({
          message: v.hint,
          type: 'input',
          name: v.key,
        });
        break;
      }
      case 'host-ip': {
        const choices: any[] = ['0.0.0.0'];
        const netInfo = os.networkInterfaces();
        for(const [key, value] of Object.entries(netInfo)) {
          for (const info of value) {
            choices.push({
              name: `${info.address}(${key})`,
              value: info.address,
            });
          }
        }
        choices.push({
          name: 'other',
          value: null,
        });
        result.push({
          message: v.hint,
          type: 'list',
          name: v.key,
          choices,
        });
        result.push({
          message: v.hint,
          type: 'input',
          name: v.key,
          askAnswered: true,
          when: (input) => {
            return input[v.key] === null ? true : false;
          }
        })
        break;
      }
    }
  }
  return result;
}

export async function generateConfigFile(options: IGenerateConfigFile) {
  let preVar = {};
  const preVarFilePath = path.join(path.dirname(options.template), '.var.json');
  try {
    const preFile = await fs.readFile(preVarFilePath, {encoding: 'utf-8'});
    preVar = JSON.parse(preFile);
  } catch(err) {}
  const templateContent = await fs.readFile(options.template, {encoding: 'utf-8'});
  const vars = [];
  template.defaults.rules = [{
    test: /\$\(([\w\W]*?)\)/,
    use: function(match, code) {
        return {
          code: code,
          output: 'escape'
        }
      }
    }, {
      test: /\#define\(([\w\W]*?)\)(\S*?)[\r\n]/,
      use: function(match, code) {
        const [key, type, ...hint] = match.slice(8, match.lastIndexOf(')')).split(',');
        vars.push({key: key.trim(), type: type.trim(), hint: hint.join(',').trim()});
        return {
          code: '',
          output: false
        }
      }
    }];

  template.render(templateContent, {});
  const data = await inquirer
      .prompt(buildInquirerByVars(vars), preVar);
  const distContent = template.render(templateContent, data);
  await fs.writeFile(preVarFilePath, JSON.stringify(data, null, 2));
  await fs.writeFile(options.dist, distContent);
}

export async function generateService(config: Config, tree: FileTree, options: IGenerateServiceOptions) {
  const [serviceNameFilePath, serviceNameEnum] = config.sora.serviceNameEnum.split('#');
  const serviceFileName = `${Utility.camelize(options.name, true)}Service.ts`;
  const serviceFilePath = path.join(config.sora.serviceDir, `${Utility.camelize(options.name, true)}Service`);
  const serviceFileExPath = path.join(config.sora.serviceDir, serviceFileName);
  const serviceNameServiceRelativePath = Utility.resolveImportPath(serviceFileExPath, serviceNameFilePath);
  const upperCamelCaseServiceName = Utility.camelize(options.name, true);
  const upperCamelCaseServiceFullName = `${upperCamelCaseServiceName}Service`;
  const [serviceRegisterFilePath, registerMethodPath] = config.sora.serviceRegister.split('#');
  const [serviceRegisterClass, serviceRegisterMethod] = registerMethodPath.split('.');
  const handlerRelativePath = Utility.resolveImportPath(serviceFileExPath, options.handlerFilePath);

  const exitedFile = tree.getFile(serviceFileExPath);
  if (exitedFile)
    throw new Error('Service file exited');

  const data = {
    serviceName: Utility.camelize(options.name, false),
    upperCamelCaseServiceName,
    serviceNameFilePath,
    serviceFileExPath,
    serviceNameServiceRelativePath,
    serviceNameEnum,
    handlerRelativePath
  };

  const result = template(path.resolve(__dirname, '../../template/service/Service.ts.art'), data);
  const serviceFile = tree.newFile(serviceFileExPath) as ScriptFileNode;
  serviceFile.setContent(result);

  const serviceNameFileExtPath = serviceNameFilePath + '.ts';
  const serviceNameFile = tree.getFile(serviceNameFileExtPath) as ScriptFileNode;
  await serviceNameFile.load();
  const serviceNameFileAST = new AST(serviceNameFile);
  serviceNameFileAST.insertEnum(serviceNameEnum, upperCamelCaseServiceName, Utility.dashlize(upperCamelCaseServiceName));

  const serviceRegisterFileExtPath = serviceRegisterFilePath + '.ts';
  const serviceRegisterFile = tree.getFile(serviceRegisterFileExtPath) as ScriptFileNode;
  const serviceRegisterServiceRelativePath = Utility.resolveImportPath(serviceRegisterFilePath, serviceFilePath);
  await serviceRegisterFile.load();
  const serviceRegisterAST = new AST(serviceRegisterFile);
  serviceRegisterAST.addImport(upperCamelCaseServiceFullName, serviceRegisterServiceRelativePath + '.js', false);
  serviceRegisterAST.insertCodeInClassMethod(serviceRegisterClass, serviceRegisterMethod, `\n    ${upperCamelCaseServiceFullName}.register();`);
}

export async function generateWorker(config: Config, tree: FileTree, options: IGenerateWorkerOptions) {
  const [workerNameFilePath, workerNameEnum] = config.sora.workerNameEnum.split('#');
  const workerFileName = `${Utility.camelize(options.name, true)}Worker.ts`;
  const workerFilePath = path.join(config.sora.workerDir, `${Utility.camelize(options.name, true)}Worker`);
  const workerFileExPath = path.join(config.sora.workerDir, workerFileName);
  const workerNameWorkerRelativePath = Utility.resolveImportPath(workerFileExPath, workerNameFilePath);
  const upperCamelCaseWorkerName = Utility.camelize(options.name, true);
  const upperCamelCaseWorkerFullName = `${upperCamelCaseWorkerName}Worker`;
  const [workerRegisterFilePath, registerMethodPath] = config.sora.workerRegister.split('#');
  const [workerRegisterClass, workerRegisterMethod] = registerMethodPath.split('.');

  const exitedFile = tree.getFile(workerFileExPath);
  if (exitedFile)
    throw new Error('Worker file exited');

  const data = {
    upperCamelCaseWorkerName,
    workerNameFilePath,
    workerFileExPath,
    workerNameWorkerRelativePath,
    workerNameEnum,
  };

  const result = template(path.resolve(__dirname, '../../template/worker/Worker.ts.art'), data);
  const workerFile = tree.newFile(workerFileExPath) as ScriptFileNode;
  workerFile.setContent(result);

  const workerNameFileExtPath = workerNameFilePath + '.ts';
  const workerNameFile = tree.getFile(workerNameFileExtPath) as ScriptFileNode;
  await workerNameFile.load();
  const workerNameFileAST = new AST(workerNameFile);
  workerNameFileAST.insertEnum(workerNameEnum, upperCamelCaseWorkerName, Utility.dashlize(upperCamelCaseWorkerName));

  const workerRegisterFileExtPath = workerRegisterFilePath + '.ts';
  const workerRegisterFile = tree.getFile(workerRegisterFileExtPath) as ScriptFileNode;
  const workerRegisterServiceRelativePath = Utility.resolveImportPath(workerRegisterFilePath, workerFilePath);
  await workerRegisterFile.load();
  const workerRegisterAST = new AST(workerRegisterFile);
  workerRegisterAST.addImport(upperCamelCaseWorkerFullName, workerRegisterServiceRelativePath, false);
  workerRegisterAST.insertCodeInClassMethod(workerRegisterClass, workerRegisterMethod, `\n    ${upperCamelCaseWorkerFullName}.register();`);
}

export async function generateHandler(config: Config, tree: FileTree, options: IGenerateRouteOptions) {
  const handlerName = Utility.camelize(options.name, true);
  const handlerFilePath = path.join(config.sora.handlerDir, `${handlerName}Handler`);
  const handlerFileExPath = handlerFilePath + '.ts';

  const exitedFile = tree.getFile(handlerFileExPath);
  if (exitedFile)
    throw new Error('Handler file exited');

  const data = {
    handlerName
  };
  const result = template(path.resolve(__dirname, '../../template/handler/Handler.ts.art'), data);
  const handlerFile = tree.newFile(handlerFileExPath) as ScriptFileNode;
  handlerFile.setContent(result);
  return handlerFilePath;
}

export async function generateDatabase(config: Config, tree: FileTree, options: IGenerateDatabaseOptions) {
  const databaseName = Utility.camelize(options.name, true);
  const fileName = Utility.camelize(options.file, true);
  const databaseFilePath = path.join(config.sora.databaseDir, fileName);
  const databaseFileExPath = databaseFilePath + '.ts';
  const exitedFile = tree.getFile(databaseFileExPath);
  const data = {
    databaseName,
  };
  if (exitedFile) {
    const result = template(path.resolve(__dirname, '../../template/database/ExtendDatabase.ts.art'), data);
    const databaseFile = exitedFile as ScriptFileNode;
    await databaseFile.load();
    let content = exitedFile.getContent();
    if (!content.endsWith(databaseFile.lineSequence))
      content += databaseFile.lineSequence;
    content += databaseFile.lineSequence;
    databaseFile.setContent(Buffer.from(content + result + databaseFile.lineSequence));
    tree.addFile(databaseFile);
  } else {
    const result = template(path.resolve(__dirname, '../../template/database/Database.ts.art'), data);
    const databaseFile = tree.newFile(databaseFileExPath) as ScriptFileNode;
    databaseFile.setContent(result);
  }

  // 注入组件
  if (options.component) {
    const [componentNameFilePath, componentNameEnum] = config.sora.componentNameEnum.split('#');
    const componentNameFileExPath = componentNameFilePath + '.ts';
    const componentNameFile = tree.getFile(componentNameFileExPath) as ScriptFileNode;
    if (!componentNameFile)
      throw new Error(`Component name file not found`);
    await componentNameFile.load();

    const componentNameFileAST = new AST(componentNameFile);
    const componentNameMap = componentNameFileAST.getEnumStringPair(componentNameEnum);
    const componentNameKey = componentNameMap[options.component];
    if (!componentNameKey)
      throw new Error(`Component name not found`);

    const [comFilePath, comName] = config.sora.comClass.split('#');
    const comFileExPath = comFilePath + '.ts';
    const comFile = tree.getFile(comFileExPath) as ScriptFileNode;
    if (!comFile)
      throw new Error(`Com file not found`);
    await comFile.load();

    const comFileAST = new AST(comFile);
    const importPath = Utility.resolveImportPath(comFilePath, databaseFilePath);
    comFileAST.addImport(databaseName, importPath);
    comFileAST.addDatabase(comName, componentNameKey, databaseName);
  }
}

export async function buildAPIDeclare(config: Config, tree: FileTree, options: IBuildAPIDeclareOptions) {
  const handlerFiles = tree.readDir(config.sora.handlerDir, false);
  const databaseFiles = tree.readDir(config.sora.databaseDir, false);
  const handlerDeclareFiles = handlerFiles.filter(file => path.extname(file.absolutePath) === '.ts').filter(file => {
    let shouldInclude = true;
    const name = path.basename(file.absolutePath, '.ts');
    if (options.includeHandler && options.includeHandler.length) {
      shouldInclude = options.includeHandler.includes(name) && shouldInclude;
    }
    if (options.excludeHandler && options.excludeHandler.length) {
      shouldInclude = !options.excludeHandler.includes(name) && shouldInclude;
    }
    return shouldInclude;
  }).map(file => {
    return file.absolutePath;
  });

  const databaseDeclareFiles = databaseFiles.filter(file => path.extname(file.absolutePath) === '.ts').filter(file => {
    let shouldInclude = true;
    const name = path.basename(file.absolutePath, '.ts');
    if (options.includeDatabase && options.includeDatabase.length) {
      shouldInclude = options.includeDatabase.includes(name) && shouldInclude;
    }
    if (options.excludeDatabase && options.excludeDatabase.length) {
      shouldInclude = !options.excludeDatabase.includes(name) && shouldInclude;
    }
    return shouldInclude;
  }).map(file => {
    return file.absolutePath;
  });

  const [serviceNameFilePath, serviceNameEnumName] = config.sora.serviceNameEnum.split('#');
  const serviceNameFileExtPath = serviceNameFilePath + '.ts';
  const serviceNameFile = tree.getFile(serviceNameFileExtPath) as ScriptFileNode;

  const [userErrorCodeFilePath, userErrorCodeEnumName] = config.sora.userErrorCodeEnum.split('#');
  const userErrorCodeFileExtPath = userErrorCodeFilePath + '.ts';
  const userErrorCodeFile = tree.getFile(userErrorCodeFileExtPath) as ScriptFileNode;

  let customEnumList = [];
  if (config.sora.customEnum) {
    for (const enumPath of config.sora.customEnum) {
      const [filePath, enumName] = enumPath.split('#');
      const codeFileExtPath = filePath + '.ts';
      const codeFile = tree.getFile(codeFileExtPath) as ScriptFileNode;

      customEnumList.push({
        file: codeFile.absolutePath,
        exports: [enumName],
      });
    }
  }

  const tsFile = new DTSProject({
    compilerOptions: {
      ...config.ts,
      outDir: config.soraRoot,
    },
    skipAddingFilesFromTsConfig: true,
  }, config.soraRoot);
  tsFile.addDatabaseSourceFiles(databaseDeclareFiles);
  tsFile.addHandlerSourceFiles(handlerDeclareFiles);
  tsFile.addExtraEnumFiles([{
    file: serviceNameFile.absolutePath,
    exports: [serviceNameEnumName],
  }, {
    file: userErrorCodeFile.absolutePath,
    exports: [userErrorCodeEnumName],
  }]);
  if (customEnumList.length) {
    tsFile.addExtraEnumFiles(customEnumList);
  }

  // tsFile.analysis();
  const distFile = tree.newFile(config.sora.apiDeclarationOutput) as ScriptFileNode;
  distFile.setContent(Buffer.from(tsFile.generateDeclartionFile()));
}
