import path from 'path';
import { ILogger } from '../logger.js';
import { IFilesystemTool } from '../tools/FilesystemTool.js';
import { TriageAgent } from '../agents/TriageAgent.js';
import { CommsAgent } from '../agents/CommsAgent.js';
import { WeatherAgent } from '../agents/WeatherAgent.js';
import { Bundle } from '../types/Bundle.js';

export class WorkflowManager {
  private triageAgent: TriageAgent;
  private commsAgent: CommsAgent;
  private weatherAgent: WeatherAgent;
  private logger: ILogger;
  private fsTool: IFilesystemTool;

  constructor(
    triageAgent: TriageAgent,
    commsAgent: CommsAgent,
    weatherAgent: WeatherAgent,
    logger: ILogger,
    fsTool: IFilesystemTool
  ) {
    this.triageAgent = triageAgent;
    this.commsAgent = commsAgent;
    this.weatherAgent = weatherAgent;
    this.logger = logger;
    this.fsTool = fsTool;
  }

  async processBundleFile(filePath: string): Promise<void> {
    try {
      const rawContent = this.fsTool.readFile(filePath);
      const bundle = JSON.parse(rawContent) as Bundle;

      await this.executeWorkflow(bundle, filePath);
    } catch (err: any) {
      this.logger.error('WorkflowManager', `Failed to process bundle file ${filePath}: ${err.message}`);
    }
  }

  private async executeWorkflow(bundle: Bundle, originalFilePath: string): Promise<void> {
    this.logger.log('Manager', 'Bundle received');
    this.logger.arrow();

    // 1. Triage Agent
    this.logger.log('Manager', 'Delegating TriageAgent');
    this.logger.arrow();
    
    const triageResult = await this.triageAgent.execute(bundle);
    
    this.logger.log('Manager', `Completed severity ${triageResult.severity}`);
    this.logger.arrow();

    // 2. Comms Agent
    this.logger.log('Manager', 'Delegating CommsAgent');
    this.logger.arrow();

    await this.commsAgent.execute(bundle, triageResult);

    this.logger.log('Manager', 'Created family.txt dispatch.txt');
    this.logger.arrow();

    // 3. Weather Agent
    this.logger.log('Manager', 'Delegating WeatherAgent');
    this.logger.arrow();

    const weatherResult = await this.weatherAgent.execute();

    if (weatherResult.hasAdvisory) {
      this.logger.log('Manager', 'Weather advisory generated');
    } else {
      this.logger.log('Manager', 'Weather assessment completed (No advisory required)');
    }
    this.logger.arrow();

    // 4. Archive original bundle so it is not processed repeatedly
    try {
      const parentDir = path.dirname(originalFilePath);
      const archiveDir = path.join(parentDir, 'processed');
      this.fsTool.ensureDir(archiveDir);
      
      const fileName = path.basename(originalFilePath);
      const archivePath = path.join(archiveDir, fileName);
      
      // Move file
      this.fsTool.writeFile(archivePath, JSON.stringify(bundle, null, 2));
      this.fsTool.deleteFile(originalFilePath);
      this.logger.log('Manager', `Archived processed bundle to: ${archivePath}`);
    } catch (archiveErr) {
      this.logger.warn('WorkflowManager', `Failed to archive bundle file: ${archiveErr}`);
    }

    this.logger.log('Manager', 'Workflow complete');
  }
}
