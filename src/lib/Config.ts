import path = require('path');

interface ISoraConfig {
  root: string;
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
}

interface ICliConfig {
  indentation: string;
}

class Config {
  async load() {
    // await this.loadCliConfig();
    await this.loadSoraConfig();
  }

  async loadCliConfig() {
    this.cliConfigPath_ = process.cwd();
    this.cliConfig_ = await import(path.resolve(this.cliConfigPath_, 'sora-cli.json'));
  }

  async loadSoraConfig() {
    this.soraConfigPath_ = process.cwd();
    this.soraConfig_ = await import(path.resolve(this.soraConfigPath_, 'sora.json'));
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

  private soraConfig_: ISoraConfig;
  private soraConfigPath_: string;
  private cliConfigPath_: string;
  private cliConfig_: ICliConfig;
}

export {Config}
