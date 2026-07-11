import fs from 'fs';
import path from 'path';

export interface IFilesystemTool {
  ensureDir(dirPath: string): void;
  readFile(filePath: string): string;
  writeFile(filePath: string, content: string): void;
  deleteFile(filePath: string): void;
  exists(filePath: string): boolean;
  listJsonFiles(dirPath: string): string[];
}

export class FilesystemTool implements IFilesystemTool {
  ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  readFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
  }

  writeFile(filePath: string, content: string): void {
    const parentDir = path.dirname(filePath);
    this.ensureDir(parentDir);
    fs.writeFileSync(filePath, content, 'utf8');
  }

  deleteFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  listJsonFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(dirPath, file));
  }
}
