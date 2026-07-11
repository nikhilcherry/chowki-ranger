import path from 'path';
import { BaseAgent } from './BaseAgent.js';
import { WeatherResult } from '../types/AgentResult.js';
import { IWeatherTool } from '../tools/WeatherTool.js';
import { IFilesystemTool } from '../tools/FilesystemTool.js';
import { cleanAndParseJson } from '../utils/json.js';

export class WeatherAgent extends BaseAgent {
  private weatherTool: IWeatherTool;
  private fsTool: IFilesystemTool;
  private meshInDir: string;
  private lat: number;
  private lon: number;

  constructor(
    geminiClient: any,
    logger: any,
    weatherTool: IWeatherTool,
    fsTool: IFilesystemTool,
    meshInDir: string,
    lat: number,
    lon: number
  ) {
    super(geminiClient, logger);
    this.weatherTool = weatherTool;
    this.fsTool = fsTool;
    this.meshInDir = meshInDir;
    this.lat = lat;
    this.lon = lon;
  }

  async execute(): Promise<WeatherResult> {
    this.logger.log('WeatherAgent', `Fetching live weather conditions for Lat ${this.lat}, Lon ${this.lon}...`);
    
    let weatherData;
    try {
      weatherData = await this.weatherTool.fetchWeather(this.lat, this.lon);
      this.logger.log('WeatherAgent', `Fetched weather: ${weatherData.summary} (${weatherData.temperature}°C, Precipitation: ${weatherData.precipitation}mm)`);
    } catch (err: any) {
      this.logger.warn('WeatherAgent', `Weather API unavailable: ${err.message}. Simulating warning check.`);
      // Weather API failed - simulate a storm risk to ensure robust testing in fallback
      weatherData = {
        temperature: 12,
        windspeed: 35,
        weatherCode: 95, // Thunderstorm
        precipitation: 3.5,
        summary: 'Thunderstorms and heavy rain (Simulated due to API error)'
      };
    }

    const prompt = `
You are the WeatherAgent of the Chowki Ranger Station. Your role is to evaluate live weather data and determine if a weather advisory should be broadcast back uphill into the offline hiking trail mesh.

LIVE WEATHER DATA:
- Temperature: ${weatherData.temperature}°C
- Wind Speed: ${weatherData.windspeed} km/h
- Current Precipitation: ${weatherData.precipitation} mm
- Forecast Summary: "${weatherData.summary}"
- WMO Weather Code: ${weatherData.weatherCode}

CRITICAL ASSESSMENT RULES:
1. Determine if there is an active storm risk or heavy rain.
   - Storm risks include: thunderstorms, heavy snow, high winds (> 30 km/h), or heavy rain.
   - Heavy rain is defined as precipitation > 1.5mm or WMO codes 63, 65, 81, 82, 95, 96, 99.
2. If risk is detected, you MUST set "hasAdvisory" to true and populate the "advisoryBundle".
3. The "direction" of warning should generally be "uphill" to warn hikers ascending into potential danger zones.
4. Urgency should be "advisory" or "warning" based on severe thunderstorm/blizzard risks.
5. You must respond ONLY with a valid JSON object matching this schema:
{
  "hasAdvisory": boolean,
  "summary": "string (brief summary of current weather)",
  "advisoryBundle": {
    "direction": "uphill" | "downhill" | "all",
    "urgency": "advisory" | "warning",
    "message": "string (the actual brief text to broadcast over radio mesh, keep under 120 chars)"
  }
}
`;

    try {
      const responseText = await this.geminiClient.generate(prompt, true);
      const result = cleanAndParseJson<WeatherResult>(responseText);

      this.logger.log('WeatherAgent', `Evaluation finished. Advisory required? ${result.hasAdvisory}`);

      if (result.hasAdvisory && result.advisoryBundle) {
        const bundleId = `weather-advisory-${Date.now()}`;
        const outputPayload = {
          id: bundleId,
          senderId: 'ranger-station',
          timestamp: Date.now(),
          message: result.advisoryBundle.message,
          direction: result.advisoryBundle.direction,
          urgency: result.advisoryBundle.urgency,
          latitude: this.lat,
          longitude: this.lon
        };

        const outPath = path.join(this.meshInDir, `${bundleId}.json`);
        this.fsTool.writeFile(outPath, JSON.stringify(outputPayload, null, 2));
        
        this.logger.log('WeatherAgent', `Weather advisory bundle injected into mesh-in: ${outPath}`);
        this.logger.info('WeatherAgent', `[Mesh-In Weather Advisory]: ${result.advisoryBundle.message} (${result.advisoryBundle.direction})`);
      }

      return result;
    } catch (err) {
      this.logger.error('WeatherAgent', err);
      return {
        hasAdvisory: false,
        summary: weatherData.summary
      };
    }
  }
}
