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
}

export {Utility};
