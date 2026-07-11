import { IGeminiClient } from '../tools/GeminiClient.js';
import { ILogger } from '../logger.js';

export abstract class BaseAgent {
  protected geminiClient: IGeminiClient;
  protected logger: ILogger;

  constructor(geminiClient: IGeminiClient, logger: ILogger) {
    this.geminiClient = geminiClient;
    this.logger = logger;
  }
}
