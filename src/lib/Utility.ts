import camelcase = require('camelcase');
import path = require('path');

class Utility {
  static camelize(str: string, upper = false) {
    return camelcase(str, {pascalCase: upper});
  }

  static dashlize(str) {
    return str.split(/(?=[A-Z])/).join('-').toLowerCase();
  }

  static resolveImportPath(fromFilePath: string, target: string) {
    const result = path.relative(path.dirname(fromFilePath), target);
    if (!result.startsWith('.'))
      return './' + result.replace(/\\/g, '/');
    return result.replace(/\\/g, '/');
  }

  static exchangeExtname(filePath: string, ext: string) {
    const base = path.basename(filePath).split('.').slice(0, -1).join('.');
    return path.join(path.dirname(filePath), `${base}.${ext}`);
  }

  static convertDTSFileToTSFile(filePath: string) {
    return filePath.slice(0, 0 - '.d.ts'.length) + '.ts';
  }
}

export {Utility};
