import path = require('path');
import * as ts from 'typescript';

interface ISoraConfig {
  root: string;
  dist: string;
  serviceDir: string;
  serviceNameEnum: string;
  serviceRegister: string;
  handlerDir: string;
  workerDir: string;
  workerNameEnum: string;
  workerRegister: string;
  databaseDir: string;
  componentNameEnum: string;
  comClass: string;
  apiDeclarationOutput: string;
  userErrorCodeEnum: string;
}

interface ICliConfig {
  indentation: string;
}

class Config {
  async load() {
    // await this.loadCliConfig();
    await this.loadSoraConfig();
    await this.loadTSConfig();
  }

  async loadCliConfig() {
    this.cliConfigPath_ = process.cwd();
    this.cliConfig_ = await import(path.resolve(this.cliConfigPath_, 'sora-cli.json'));
  }

  async loadSoraConfig() {
    this.soraConfigPath_ = process.cwd();
    this.soraConfig_ = await import(path.resolve(this.soraConfigPath_, 'sora.json'));
  }

  async loadTSConfig() {
    const tsPkg = await import(path.resolve(process.cwd(), 'tsconfig.json'));
    const result = ts.convertCompilerOptionsFromJson(tsPkg.compilerOptions, undefined);
    if (result.errors.length) {
      throw new Error('Parse tsconfig.json failed');
    }
    this.tsConfig_ = result.options;
  }

  get sora() {
    return this.soraConfig_;
  }

  get cli() {
    return this.cliConfig_;
  }

  get soraRoot() {
    return path.resolve(this.soraConfigPath_, this.sora.root);
  }

  get ts() {
    return this.tsConfig_;
  }

  private soraConfig_: ISoraConfig;
  private soraConfigPath_: string;
  private cliConfigPath_: string;
  private cliConfig_: ICliConfig;
  private tsConfig_: ts.CompilerOptions;
}

export {Config}
