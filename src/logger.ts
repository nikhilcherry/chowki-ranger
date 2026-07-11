import fs from 'fs';
import { formatTime } from './utils/time.js';

export interface ILogger {
  log(module: string, message: string): void;
  arrow(): void;
  info(module: string, message: string): void;
  warn(module: string, message: string): void;
  error(module: string, error: any): void;
}

export class Logger implements ILogger {
  private logFilePath: string;

  constructor(logFilePath: string) {
    this.logFilePath = logFilePath;
  }

  private writeToFile(text: string): void {
    try {
      fs.appendFileSync(this.logFilePath, text + '\n', 'utf8');
    } catch (err) {
      console.error(`[Logger Error] Failed writing to log file: ${err}`);
    }
  }

  log(module: string, message: string): void {
    const time = formatTime(new Date());
    const formattedConsole = `\x1b[36m${time}\x1b[0m [\x1b[33m${module}\x1b[0m] ${message}`;
    const formattedFile = `${time} [${module}] ${message}`;
    
    console.log(formattedConsole);
    this.writeToFile(formattedFile);
  }

  arrow(): void {
    const formattedConsole = `  \x1b[32m↓\x1b[0m`;
    console.log(formattedConsole);
    this.writeToFile(`  ↓`);
  }

  info(module: string, message: string): void {
    const time = formatTime(new Date());
    const formattedConsole = `\x1b[36m${time}\x1b[0m [\x1b[34m${module}\x1b[0m] \x1b[32m${message}\x1b[0m`;
    const formattedFile = `${time} [${module}] INFO: ${message}`;
    
    console.log(formattedConsole);
    this.writeToFile(formattedFile);
  }

  warn(module: string, message: string): void {
    const time = formatTime(new Date());
    const formattedConsole = `\x1b[36m${time}\x1b[0m [\x1b[35m${module}\x1b[0m] \x1b[33mWARN: ${message}\x1b[0m`;
    const formattedFile = `${time} [${module}] WARN: ${message}`;
    
    console.warn(formattedConsole);
    this.writeToFile(formattedFile);
  }

  error(module: string, error: any): void {
    const time = formatTime(new Date());
    const errMsg = error instanceof Error ? error.message : String(error);
    const formattedConsole = `\x1b[36m${time}\x1b[0m [\x1b[31m${module}\x1b[0m] \x1b[31mERROR: ${errMsg}\x1b[0m`;
    const formattedFile = `${time} [${module}] ERROR: ${errMsg}`;
    
    console.error(formattedConsole);
    this.writeToFile(formattedFile);
  }
}
