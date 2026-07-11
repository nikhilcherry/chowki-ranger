import { IFilesystemTool } from '../tools/FilesystemTool.js';
import { ILogger } from '../logger.js';
import { WorkflowManager } from '../manager/WorkflowManager.js';

export class InboxWatcher {
  private fsTool: IFilesystemTool;
  private logger: ILogger;
  private manager: WorkflowManager;
  private inboxDir: string;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    fsTool: IFilesystemTool,
    logger: ILogger,
    manager: WorkflowManager,
    inboxDir: string
  ) {
    this.fsTool = fsTool;
    this.logger = logger;
    this.manager = manager;
    this.inboxDir = inboxDir;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    this.fsTool.ensureDir(this.inboxDir);
    this.logger.info('InboxWatcher', `Monitoring directory for new bundles: ${this.inboxDir}`);

    this.intervalId = setInterval(() => {
      this.poll();
    }, 1000);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.logger.info('InboxWatcher', 'Stopped monitoring inbox.');
  }

  private poll(): void {
    try {
      const files = this.fsTool.listJsonFiles(this.inboxDir);
      for (const filePath of files) {
        // Initiate workflow processing sequentially
        this.manager.processBundleFile(filePath);
      }
    } catch (err: any) {
      this.logger.error('InboxWatcher', `Error during folder poll: ${err.message}`);
    }
  }
}
