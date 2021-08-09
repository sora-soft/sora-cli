import {promises as fs} from 'fs';
import mkdirp = require('mkdirp');
import {FileTree} from './FileTree';
import pathModule = require('path');
const path = pathModule.posix;

class FileNode {
  constructor(subPath: string, tree: FileTree) {
    this.subPath_ = subPath;
    this.tree_ = tree;
  }

  async load() {
    if (this.content_)
      return;
    this.content_ = this.raw_ = await fs.readFile(this.absolutePath);
  }

  toString(encoding?: BufferEncoding) {
    return this.content_.toString(encoding);
  }

  toJSON() {
    return JSON.parse(this.toString());
  }

  get absolutePath() {
    return pathModule.resolve(this.tree_.rootPath, this.subPath_);
  }

  setContent(content: Buffer) {
    this.content_ = content;
  }

  getContent(): any {
    return this.content_;
  }

  get raw() {
    return this.raw_;
  }

  get path() {
    return this.subPath_;
  }

  async save() {
    await mkdirp(path.dirname(this.absolutePath));
    await fs.writeFile(this.absolutePath, this.content_);
  }

  protected tree_: FileTree;
  protected content_: Buffer;
  private raw_: Buffer;
  private subPath_: string;
}

export {FileNode}
