import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { FilesystemTool } from './tools/FilesystemTool.js';
import { WeatherTool } from './tools/WeatherTool.js';
import { GeminiClient } from './tools/GeminiClient.js';
import { TriageAgent } from './agents/TriageAgent.js';
import { CommsAgent } from './agents/CommsAgent.js';
import { WeatherAgent } from './agents/WeatherAgent.js';
import { WorkflowManager } from './manager/WorkflowManager.js';
import { InboxWatcher } from './watcher/InboxWatcher.js';

async function bootstrap() {
  const config = loadConfig();

  // Initialize Logger
  const logger = new Logger(config.logFile);
  logger.info('System', 'Chowki Ranger Station (chowki-ranger) Booting Up...');

  // Initialize Tools
  const fsTool = new FilesystemTool();
  const weatherTool = new WeatherTool();

  // Validate API key first - Support 'local' keyword for edge execution
  const apiKey = config.geminiApiKey || 'local';
  if (apiKey === 'local') {
    logger.warn('System', 'GEMINI_API_KEY not provided or set to local. Defaulting to local on-device Gemma 4 model.');
  }

  try {
    const geminiClient = new GeminiClient(apiKey, config.modelName);

    // Ensure system directories exist
    fsTool.ensureDir(config.inboxDir);
    fsTool.ensureDir(config.outboxDir);
    fsTool.ensureDir(config.meshInDir);

    // Initialize Agents
    const triageAgent = new TriageAgent(geminiClient, logger);
    const commsAgent = new CommsAgent(geminiClient, logger, fsTool, config.outboxDir);
    const weatherAgent = new WeatherAgent(
      geminiClient,
      logger,
      weatherTool,
      fsTool,
      config.meshInDir,
      config.weatherLat,
      config.weatherLon
    );

    // Initialize Coordinator (WorkflowManager)
    const manager = new WorkflowManager(
      triageAgent,
      commsAgent,
      weatherAgent,
      logger,
      fsTool
    );

    // Initialize Watcher
    const watcher = new InboxWatcher(fsTool, logger, manager, config.inboxDir);
    watcher.start();

    // Setup Shutdown Handlers
    process.on('SIGINT', () => {
      logger.info('System', 'Gracefully stopping watcher...');
      watcher.stop();
      logger.info('System', 'Chowki Ranger Station offline.');
      process.exit(0);
    });

  } catch (err: any) {
    logger.error('System', `Bootstrap fatal error: ${err.message}`);
    process.exit(1);
  }
}

bootstrap();
