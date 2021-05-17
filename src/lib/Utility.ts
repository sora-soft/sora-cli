import camelcase = require('camelcase');
import pathModule = require('path');
const path = pathModule.posix;

class Utility {
  static camelize(str: string, upper = false) {
    return camelcase(str, {pascalCase: upper});
  }

  static dashlize(str) {
    return str.split(/(?=[A-Z])/).join('-').toLowerCase();
  }

  static resolveImportPath(fromFilePath: string, target: string) {
    const result = path.relative(path.dirname(fromFilePath), target);
    if (result[0] != '.')
      return './' + result;
    return result;
  }

  static exchangeExtname(filePath: string, ext: string) {
    const base = path.basename(filePath).split('.').slice(0, -1).join('.');
    return path.join(path.dirname(filePath), `${base}.${ext}`);
  }
}

export {Utility};
