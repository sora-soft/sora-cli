import fs = require('fs/promises');
import {FileNode} from './FileNode';
import {ScriptFileNode} from './ScriptFileNode';
import pathModule = require('path');
const path = pathModule.posix;

class FileTree {
  constructor(rootPath: string) {
    this.rootPath_ = rootPath;
    this.fileMap_ = new Map();
    this.changes_ = new Set();
    this.deleteFiles_ = new Set();
  }

  async load() {
    await this.readDir_(this.rootPath_);
  }

  getFile(filePath: string, isAbsolute = false) {
    if (isAbsolute)
      filePath = path.resolve(this.rootPath_, filePath);
    return this.fileMap_.get(filePath);
  }

  // git add
  addFile(file: FileNode) {
    this.changes_.add(file);
  }

  newFile(subPath: string) {
    const isScriptFile = ['.ts', '.json'].includes(path.extname(subPath));
    const file = isScriptFile ? new ScriptFileNode(subPath, this) : new FileNode(subPath, this);
    this.fileMap_.set(subPath, file);
    this.changes_.add(file);
    return file;
  }

  deleteFile(subPath: string) {
    const file = this.fileMap_.get(subPath);
    this.deleteFiles_.add(file);
  }

  readDir(subPath: string, recursion: boolean) {
    const result: FileNode[] = [];
    for (const [filePath, file] of this.fileMap_.entries()) {
      if (filePath.indexOf(subPath) === 0) {
        if (recursion) {
          result.push(file);
        } else {
          if (path.dirname(filePath) === subPath) {
            result.push(file);
          }
        }
      }
    }
    return result;
  }

  getFileList() {
    return [...this.fileMap_.entries()].map(([filePath, file]) => file.absolutePath);
  }

  async commit() {
    for(const change of [...this.changes_]) {
      await change.save();
    }
    for (const file of [...this.deleteFiles_]) {
      await fs.rm(file.absolutePath);
    }
  }

  private async readDir_(folderPath: string) {
    const files = await fs.readdir(folderPath);
    for (const file of files) {
      const targetPath = path.join(folderPath, file);
      const subPath = path.relative(this.rootPath_, targetPath);
      const fileStat = await fs.stat(targetPath);
      if (fileStat.isDirectory()) {
        await this.readDir_(targetPath);
      }
      if (fileStat.isFile()) {
        const isScriptFile = ['.ts', '.json'].includes(path.extname(file));
        const node = isScriptFile ? new ScriptFileNode(subPath, this) : new FileNode(subPath, this);
        this.fileMap_.set(subPath, node);
      }
    }
  }

  get rootPath() {
    return this.rootPath_;
  }

  get changes() {
    return this.changes_;
  }

  private rootPath_: string;
  private fileMap_: Map<string, FileNode | ScriptFileNode>;
  private changes_: Set<FileNode | ScriptFileNode>;
  private deleteFiles_: Set<FileNode>;
}

export {FileTree}
