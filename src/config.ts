import * as fs from 'fs';
import * as path from 'path';

export interface PeerConfig {
  id: string;
  host: string;
  port: number;
}

export interface ChowkiConfig {
  id: string;
  port: number;
  peers: PeerConfig[];
  loraLoss: number;
}

/**
 * ConfigLoader is responsible for loading and validating the node configuration.
 * It ensures no other modules load JSON files or read environment variables directly.
 */
export class ConfigLoader {
  private readonly config: ChowkiConfig;

  constructor(configFilePath?: string) {
    const filePath = configFilePath || path.resolve(process.cwd(), 'chowki.config.json');
    let fileConfig: { id: string; port: number; peers: PeerConfig[] };

    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      fileConfig = JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load configuration from ${filePath}: ${(error as Error).message}`);
    }

    // Validate the parsed config structure
    if (!fileConfig.id || typeof fileConfig.id !== 'string') {
      throw new Error("Invalid configuration: 'id' is required and must be a string.");
    }
    if (typeof fileConfig.port !== 'number') {
      throw new Error("Invalid configuration: 'port' is required and must be a number.");
    }
    if (!Array.isArray(fileConfig.peers)) {
      throw new Error("Invalid configuration: 'peers' must be an array.");
    }

    for (const peer of fileConfig.peers) {
      if (!peer.id || typeof peer.id !== 'string') {
        throw new Error("Invalid peer configuration: 'id' must be a string.");
      }
      if (!peer.host || typeof peer.host !== 'string') {
        throw new Error("Invalid peer configuration: 'host' must be a string.");
      }
      if (typeof peer.port !== 'number') {
        throw new Error("Invalid peer configuration: 'port' must be a number.");
      }
    }

    // Read lora packet loss constraint from environment, defaulting to 0.1
    let loraLoss = 0.1;
    if (process.env.LORA_LOSS !== undefined) {
      const parsed = parseFloat(process.env.LORA_LOSS);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        loraLoss = parsed;
      }
    }

    this.config = {
      id: fileConfig.id,
      port: fileConfig.port,
      peers: fileConfig.peers,
      loraLoss,
    };
  }

  /**
   * Retrieves the loaded and validated configuration.
   */
  public getConfig(): ChowkiConfig {
    return this.config;
  }
}
