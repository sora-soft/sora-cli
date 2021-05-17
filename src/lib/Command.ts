import {Config} from './Config';
import {FileTree} from './fs/FileTree';
import template = require('art-template');
import {Utility} from './Utility';
import {ScriptFileNode} from './fs/ScriptFileNode';
import {AST} from './AST';
import pathModule = require('path');
const path = pathModule.posix;
import * as tsutils from 'tsutils/typeguard';
import * as ts from 'typescript';
import {DTS} from './DTS';
import {Morph} from './Morph';

interface IGenerateCommonOptions {
  dryRun?: boolean;
}

interface IGenerateServiceOptions extends IGenerateCommonOptions {
  name: string;
}

interface IGenerateRouteOptions extends IGenerateCommonOptions {
  name: string;
}

interface IGenerateWorkerOptions extends IGenerateCommonOptions {
  name: string;
}

interface IGenerateDatabaseOptions extends IGenerateCommonOptions {
  name: string;
  component?: string;
}

// interface IBuildAPIDeclare extends IGenerateCommonOptions {}

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

  const exitedFile = tree.getFile(serviceFileExPath);
  if (exitedFile)
    throw new Error('Service file exited');

  const data = {
    upperCamelCaseServiceName,
    serviceNameFilePath,
    serviceFileExPath,
    serviceNameServiceRelativePath,
    serviceNameEnum,
  };

  const result = template(pathModule.resolve(__dirname, '../../template/service/Service.ts.art'), data);
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
  serviceRegisterAST.addImport(upperCamelCaseServiceFullName, serviceRegisterServiceRelativePath, false);
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

  const result = template(pathModule.resolve(__dirname, '../../template/worker/Worker.ts.art'), data);
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
  const result = template(pathModule.resolve(__dirname, '../../template/handler/Handler.ts.art'), data);
  const handlerFile = tree.newFile(handlerFileExPath) as ScriptFileNode;
  handlerFile.setContent(result);
}

export async function generateDatabase(config: Config, tree: FileTree, options: IGenerateDatabaseOptions) {
  const databaseName = Utility.camelize(options.name, true);
  const databaseFilePath = path.join(config.sora.databaseDir, databaseName);
  const databaseFileExPath = databaseFilePath + '.ts';

  const exitedFile = tree.getFile(databaseFileExPath);
  if (exitedFile)
    throw new Error('Database file exited');

  const data = {
    databaseName,
  };
  const result = template(pathModule.resolve(__dirname, '../../template/database/Database.ts.art'), data);
  const handlerFile = tree.newFile(databaseFileExPath) as ScriptFileNode;
  handlerFile.setContent(result);

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

export async function buildAPIDeclare(config: Config, tree: FileTree) {
  const handlerFiles = tree.readDir(config.sora.handlerDir, false);
  const databaseFiles = tree.readDir(config.sora.databaseDir, false);

  const handlerDeclareFiles = handlerFiles.filter(file => path.extname(file.absolutePath) === '.ts').map(file => {
    return file.absolutePath;
  });

  const databaseDeclareFiles = databaseFiles.filter(file => path.extname(file.absolutePath) === '.ts').map(file => {
    return file.absolutePath;
  });

  const [serviceNameFilePath, serviceNameEnumName] = config.sora.serviceNameEnum.split('#');
  const serviceNameFileExtPath = serviceNameFilePath + '.ts';
  const serviceNameFile = tree.getFile(serviceNameFileExtPath) as ScriptFileNode;

  const [userErrorCodeFilePath, userErrorCodeEnumName] = config.sora.userErrorCodeEnum.split('#');
  const userErrorCodeFileExtPath = userErrorCodeFilePath + '.ts';
  const userErrorCodeFile = tree.getFile(userErrorCodeFileExtPath) as ScriptFileNode;

  const morph = new Morph({});
  morph.addDatabaseSourceFiles(databaseDeclareFiles);
  morph.addHandlerSourceFiles(handlerDeclareFiles);
  morph.addServiceNameSourceFile(serviceNameFile.absolutePath, serviceNameEnumName);
  morph.addUserErrorCodeSourceFile(userErrorCodeFile.absolutePath, userErrorCodeEnumName);
  morph.analysisServiceNameEnum();
  morph.analysisUserErrorCodeEnum();
  morph.analysisDatabaseClass();
  morph.analysisRouteClass();

  const distFile = tree.newFile(config.sora.apiDeclarationOutput) as ScriptFileNode;
  distFile.setContent(morph.generateDistFile());
}
