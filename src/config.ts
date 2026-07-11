import dotenv from 'dotenv';
import path from 'path';
import { Config } from './types/Config.js';

dotenv.config();

const DEFAULT_LAT = 44.33; // Grand Teton Ranger Station coords
const DEFAULT_LON = -110.79;

export const loadConfig = (): Config => {
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  const modelName = process.env.MODEL_NAME || 'gemini-2.5-flash';
  
  const inboxDir = path.resolve(process.env.INBOX_DIR || 'mesh-out');
  const outboxDir = path.resolve(process.env.OUTBOX_DIR || 'outbox');
  const meshInDir = path.resolve(process.env.MESH_IN_DIR || 'mesh-in');
  
  const weatherLat = parseFloat(process.env.WEATHER_LAT || '') || DEFAULT_LAT;
  const weatherLon = parseFloat(process.env.WEATHER_LON || '') || DEFAULT_LON;
  const logFile = path.resolve(process.env.LOG_FILE || 'ranger.log');

  return {
    geminiApiKey,
    modelName,
    inboxDir,
    outboxDir,
    meshInDir,
    weatherLat,
    weatherLon,
    logFile,
  };
};
