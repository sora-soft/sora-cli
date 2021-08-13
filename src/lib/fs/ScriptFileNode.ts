import {FileNode} from './FileNode';
import {promises as fs} from 'fs';
import mkdirp = require('mkdirp');
import pathModule = require('path');
const path = pathModule;

export interface IChange {
  start: number;
  end: number;
  content: string;
}

class ScriptFileNode extends FileNode {
  async load() {
    await super.load();
    this.scripts_ = this.toString();
  }

  async save() {
    await mkdirp(path.dirname(this.absolutePath));
    await fs.writeFile(this.absolutePath, this.getContent());
  }

  get lineSequence() {
    return this.isCRLF() ? '\r\n' : '\n';
  }

  modify(change: IChange) {
    const prefix = this.scripts_.substr(0, change.start);
    const suffix = this.scripts_.substr(change.end);
    this.scripts_ = `${prefix}${change.content}${suffix}`;
    this.tree_.addFile(this);
  }

  setContent(value: Buffer) {
    this.scripts_ = value.toString();
  }

  getContent(): string {
    return this.scripts_;
  }

  private isCRLF() {
    return this.toString().includes('\r\n');
  }

  private scripts_: string;
}

export {ScriptFileNode}
