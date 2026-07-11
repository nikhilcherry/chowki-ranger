import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriageAgent } from '../src/agents/TriageAgent.js';
import { CommsAgent } from '../src/agents/CommsAgent.js';
import { WeatherAgent } from '../src/agents/WeatherAgent.js';
import { IGeminiClient } from '../src/tools/GeminiClient.js';
import { IWeatherTool, WeatherData } from '../src/tools/WeatherTool.js';
import { IFilesystemTool } from '../src/tools/FilesystemTool.js';
import { ILogger } from '../src/logger.js';
import { Bundle } from '../src/types/Bundle.js';

describe('Chowki Ranger Orchestration Unit Tests', () => {
  let mockGeminiClient: IGeminiClient;
  let mockWeatherTool: IWeatherTool;
  let mockFsTool: IFilesystemTool;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockGeminiClient = {
      generate: vi.fn(),
    };

    mockWeatherTool = {
      fetchWeather: vi.fn(),
    };

    mockFsTool = {
      ensureDir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
      deleteFile: vi.fn(),
      exists: vi.fn(),
      listJsonFiles: vi.fn(),
    };

    mockLogger = {
      log: vi.fn(),
      arrow: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  const sampleBundle: Bundle = {
    id: 'bundle-test',
    senderId: 'hiker-1',
    timestamp: 1234567,
    message: 'Help, I am stranded and cold',
    latitude: 44.33,
    longitude: -110.79,
    urgency: 'high',
  };

  it('TriageAgent should correctly parse Gemini response', async () => {
    vi.mocked(mockGeminiClient.generate).mockResolvedValue(
      JSON.stringify({
        severity: 'HIGH',
        confidence: 0.95,
        actions: ['Notify family', 'Dispatch ranger'],
      })
    );

    const triageAgent = new TriageAgent(mockGeminiClient, mockLogger);
    const result = await triageAgent.execute(sampleBundle);

    expect(result.severity).toBe('HIGH');
    expect(result.confidence).toBe(0.95);
    expect(result.actions).toContain('Notify family');
  });

  it('CommsAgent should write draft communication text files', async () => {
    vi.mocked(mockGeminiClient.generate).mockResolvedValue(
      JSON.stringify({
        familySms: 'All fine, rangers active.',
        dispatchBrief: 'Rescue coordinates...',
      })
    );

    const commsAgent = new CommsAgent(mockGeminiClient, mockLogger, mockFsTool, '/mock/outbox');
    const result = await commsAgent.execute(sampleBundle, {
      severity: 'HIGH',
      confidence: 0.95,
      actions: [],
    });

    expect(result.familySms).toBe('All fine, rangers active.');
    expect(result.dispatchBrief).toBe('Rescue coordinates...');
    expect(mockFsTool.writeFile).toHaveBeenCalledTimes(2);
  });

  it('WeatherAgent should evaluate live weather and generate advisory bundle if risk exists', async () => {
    const mockWeatherData: WeatherData = {
      temperature: 5,
      windspeed: 40,
      weatherCode: 95,
      precipitation: 3.0,
      summary: 'Severe thunderstorm',
    };

    vi.mocked(mockWeatherTool.fetchWeather).mockResolvedValue(mockWeatherData);
    vi.mocked(mockGeminiClient.generate).mockResolvedValue(
      JSON.stringify({
        hasAdvisory: true,
        summary: 'Severe thunderstorm',
        advisoryBundle: {
          direction: 'uphill',
          urgency: 'warning',
          message: 'Severe storm advisory: seek cover immediately',
        },
      })
    );

    const weatherAgent = new WeatherAgent(
      mockGeminiClient,
      mockLogger,
      mockWeatherTool,
      mockFsTool,
      '/mock/mesh-in',
      44.33,
      -110.79
    );

    const result = await weatherAgent.execute();

    expect(result.hasAdvisory).toBe(true);
    expect(result.advisoryBundle?.direction).toBe('uphill');
    expect(mockFsTool.writeFile).toHaveBeenCalled();
  });
});
