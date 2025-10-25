import chalk, { ChalkInstance } from 'chalk';
import debug from 'debug';

const isDevelopment = process.env.NODE_ENV === 'development';
const REDACTED = '<REDACTED>';
const debugNamespace = process.env.DEBUG || (isDevelopment ? 'mcp:*' : '');
if (debugNamespace) {
  debug.enable(debugNamespace);
}

export const logger = (namespace: string) => {
  const dbg = debug('mcp:' + namespace);
  const log = (colorize: ChalkInstance, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    const formattedArgs = [timestamp, ...args].map((arg) => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg, null, 2);
      }
      return arg;
    });
    dbg(colorize(formattedArgs.join(' ')));
  };

  return {
    info(...args: any[]) {
      if (isDevelopment) {
        return log(chalk.cyan, ...args);
      }
      log(chalk.cyan, args[0], ...args.slice(1).map(_ => REDACTED));
    },
    success(...args: any[]) {
      if (isDevelopment) {
        return log(chalk.green, ...args);
      }
      log(chalk.green, args[0], ...args.slice(1).map(_ => REDACTED));
    },
    warn(...args: any[]) {
      if (isDevelopment) {
        return log(chalk.yellow, ...args);
      }
      log(chalk.yellow, args[0], ...args.slice(1).map(_ => REDACTED));
    },
    error(...args: any[]) {
      if (isDevelopment) {
        return log(chalk.red, ...args);
      }
      log(chalk.red, args[0], ...args.slice(1).map(_ => REDACTED));
    },
  };
};
