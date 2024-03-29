import 'source-map-support/register';

import {Command} from 'commander';
import {FileTree} from './lib/fs/FileTree';
import {Config} from './lib/Config';
import {buildAPIDeclare, generateConfigFile, generateDatabase, generateHandler, generateService, generateWorker} from './lib/Command';
import pathModule = require('path');
import inquirer = require('inquirer');
import download = require('download-git-repo');
import ora = require('ora');
import chalk from 'chalk';
import path = require('path');
import git = require('isomorphic-git');
import http = require('isomorphic-git/http/node');
import fs = require('fs/promises');
import oFS = require('fs');

// tslint:disable-next-line
const pkg = require('../package.json');
// tslint:disable-next-line
const log = console.log;

const program = new Command();
program.version(pkg.version);

program.command('build:api-declare')
  .option('-eh, --exclude-handler <excludeHandler...>')
  .option('-ih, --include-handler <includeHandler...>')
  .option('-ed, --exclude-database <excludeDatabase...>')
  .option('-id, --include-database <includeDatabase...>')
  .action(async (options) => {
    const config = new Config();
    await config.load();
    const fileTree = new FileTree(config.soraRoot);
    await fileTree.load();

    await buildAPIDeclare(config, fileTree, options);
    await fileTree.commit();
  })

program.command('config')
  .requiredOption('-t, --template <templateFile>', 'template-config-file')
  .requiredOption('-d, --dist <distFile>', 'dist-file')
  .action(async (options) => {
    await generateConfigFile(options);
  })

program.command('generate:service')
  .requiredOption('-n, --name <name>', 'Service name')
  .option('-d, --dry-run')
  .action(async (options) => {
    const config = new Config();
    await config.load();
    const fileTree = new FileTree(config.soraRoot);
    await fileTree.load();
    const handlerFilePath = await generateHandler(config, fileTree, {
      name: options.name,
      dryRun: options.dryRun,
    });
    await generateService(config, fileTree, {
      ...options,
      handlerFilePath,
    });

    if (!options.dryRun) {
      await fileTree.commit();
  }
  });

program.command('generate:handler')
  .requiredOption('-n, --name <name>', 'Handler name')
  .option('-d, --dry-run')
  .action(async (options) => {
    const config = new Config();
    await config.load();
    const fileTree = new FileTree(config.soraRoot);
    await fileTree.load();
    await generateHandler(config, fileTree, options);

    if (!options.dryRun) {
      await fileTree.commit();
    }
  });

program.command('generate:worker')
  .requiredOption('-n, --name <name>', 'Handler name')
  .option('-d, --dry-run')
  .action(async (options) => {
    const config = new Config();
    await config.load();
    const fileTree = new FileTree(config.soraRoot);
    await fileTree.load();
    await generateWorker(config, fileTree, options);

    if (!options.dryRun) {
      await fileTree.commit();
    }
  })

program.command('generate:database')
  .requiredOption('-n, --name <name>', 'Table name')
  .requiredOption('-f, --file <file-name>', 'File name')
  .option('-d, --dry-run')
  .option('-c, --component <component>')
  .action(async (options) => {
    const config = new Config();
    await config.load();
    const fileTree = new FileTree(config.soraRoot);
    await fileTree.load();

    await generateDatabase(config, fileTree, options);

    if (!options.dryRun) {
      await fileTree.commit();
    }
  })

program.command('new <name>')
  .action(async (name) => {
    const stat = await fs.stat(name).catch(err => {
      if (err.code === 'ENOENT')
        return null;
      throw err;
    });
    if (stat) {
      log(chalk.red(`${name} is exited!`));
      return;
    }


    const options = await inquirer
      .prompt([
        {
          name: 'projectName',
          message: 'Project name?',
          default: name,
        },
        {
          name: 'description',
          message: 'Description?',
        },
        {
          name: 'version',
          message: 'Version?',
          default: '1.0.0'
        },
        {
          name: 'author',
          message: 'Author?'
        },
        {
          name: 'license',
          message: 'License?',
          default: 'MIT'
        },
        {
          name: 'confirm',
          message: 'OK?',
          default: true,
          type: 'confirm'
        }
      ]);

    if (!options.confirm) {
      return;
    }

    const loading = ora('Downloading').start();
    const dir = path.join(process.cwd(), name)
    await git.clone({
      fs: oFS,
      http,
      dir,
      url: 'https://github.com/sora-soft/backend-example-project.git',
      singleBranch: true,
      remote: 'upstream',
      depth: 1,
    });

    loading.stop();

    const pkgPath = pathModule.resolve(process.cwd(), name, 'package.json');
    const installedPkg = await import(pkgPath);

    installedPkg.name = options.projectName;
    installedPkg.description = options.description;
    installedPkg.version = options.version;
    installedPkg.author = options.author;
    installedPkg.license = options.license;

    delete installedPkg.repository;
    delete installedPkg.bugs;
    delete installedPkg.homepage;
    delete installedPkg.scripts.test;
    delete installedPkg.scripts.link;

    await fs.writeFile(pkgPath, JSON.stringify(installedPkg, null, 2));

    log(chalk.green('Project generated successfully'));
  })

program.parse(process.argv);

process.on('uncaughtException', (err) => {
  log(err);
})

process.on('unhandledRejection', (err: Error) => {
  log(err);
})
