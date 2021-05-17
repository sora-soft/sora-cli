import 'source-map-support/register';

import {Command} from 'commander';
import {FileTree} from './lib/fs/FileTree';
import {Config} from './lib/Config';
import {buildAPIDeclare, generateDatabase, generateHandler, generateService, generateWorker} from './lib/Command';
import pathModule = require('path');
import inquirer = require('inquirer');
import download = require('download-git-repo');
import ora = require('ora');
import fs = require('fs/promises');
import chalk from 'chalk';
const path = pathModule.posix;

// tslint:disable-next-line
const pkg = require('../package.json');
// tslint:disable-next-line
const log = console.log;

const program = new Command();
program.version(pkg.version);

program.command('build:api-declare')
  .action(async (options) => {
    const config = new Config();
    await config.load();
    const fileTree = new FileTree(config.soraRoot);
    await fileTree.load();

    await buildAPIDeclare(config, fileTree);
    await fileTree.commit();
  })

program.command('generate:service')
  .requiredOption('-n, --name <name>', 'Service name')
  .option('-d, --dry-run')
  .option('-wh, --with-handler')
  .action(async (options) => {
    const config = new Config();
    await config.load();
    const fileTree = new FileTree(config.soraRoot);
    await fileTree.load();
    await generateService(config, fileTree, options);

    if (options.withHandler) {
      await generateHandler(config, fileTree, {
        name: options.name,
        dryRun: options.dryRun,
      })
    }

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
  .requiredOption('-n, --name <name>', 'Database name')
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
    await new Promise<void>((resolve, reject) => {
      download('sora-soft/example-project', name, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
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
