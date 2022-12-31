import {Config} from './Config';
import {FileTree} from './fs/FileTree';
import template = require('art-template');
import {Utility} from './Utility';
import {ScriptFileNode} from './fs/ScriptFileNode';
import {AST} from './AST';
import path = require('path');
import {TSFile} from './TSFile';

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
  file: string;
  component?: string;
}

interface IBuildAPIDeclareOptions {
  excludeHandler: string[];
  includeHandler: string[];
  excludeDatabase: string[];
  includeDatabase: string[];
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
    return file.systemPath;
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
    return file.systemPath;
  });

  const [serviceNameFilePath, serviceNameEnumName] = config.sora.serviceNameEnum.split('#');
  const serviceNameFileExtPath = serviceNameFilePath + '.ts';
  const serviceNameFile = tree.getFile(serviceNameFileExtPath) as ScriptFileNode;

  const [userErrorCodeFilePath, userErrorCodeEnumName] = config.sora.userErrorCodeEnum.split('#');
  const userErrorCodeFileExtPath = userErrorCodeFilePath + '.ts';
  const userErrorCodeFile = tree.getFile(userErrorCodeFileExtPath) as ScriptFileNode;

  const tsFile = new TSFile({
    compilerOptions: {
      ...config.ts,
      outDir: config.soraRoot,
    },
    skipAddingFilesFromTsConfig: true,
  }, config.soraRoot);
  tsFile.addDatabaseSourceFiles(databaseDeclareFiles);
  tsFile.addHandlerSourceFiles(handlerDeclareFiles);
  tsFile.addExtraSourceFiles([{
    file: serviceNameFile.absolutePath,
    exports: [serviceNameEnumName],
  }, {
    file: userErrorCodeFile.absolutePath,
    exports: [userErrorCodeEnumName],
  }])

  tsFile.analysis();
  const distFile = tree.newFile(config.sora.apiDeclarationOutput) as ScriptFileNode;
  distFile.setContent(tsFile.generateDistFile());
}
