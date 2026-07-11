export interface WeatherData {
  temperature: number;
  windspeed: number;
  weatherCode: number;
  precipitation: number;
  summary: string;
}

export interface IWeatherTool {
  fetchWeather(lat: number, lon: number): Promise<WeatherData>;
}

export class WeatherTool implements IWeatherTool {
  async fetchWeather(lat: number, lon: number): Promise<WeatherData> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation,weather_code&timezone=auto`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    
    const currentWeather = data.current_weather;
    const weatherCode = currentWeather?.weathercode ?? 0;
    const temperature = currentWeather?.temperature ?? 0;
    const windspeed = currentWeather?.windspeed ?? 0;
    
    // Get current hourly precipitation if available
    let precipitation = 0;
    if (data.hourly && data.hourly.precipitation) {
      precipitation = data.hourly.precipitation[0] ?? 0;
    }

    // Map weather code to standard text
    const summary = this.getWmoDescription(weatherCode);

    return {
      temperature,
      windspeed,
      weatherCode,
      precipitation,
      summary,
    };
  }

  private getWmoDescription(code: number): string {
    if (code === 0) return 'Clear sky';
    if (code === 1 || code === 2 || code === 3) return 'Mainly clear, partly cloudy, or overcast';
    if (code === 45 || code === 48) return 'Fog and depositing rime fog';
    if (code === 51 || code === 53 || code === 55) return 'Drizzle: Light, moderate, or dense intensity';
    if (code === 56 || code === 57) return 'Freezing Drizzle: Light or dense';
    if (code === 61 || code === 63 || code === 65) return 'Rain: Slight, moderate, or heavy intensity';
    if (code === 66 || code === 67) return 'Freezing Rain: Light or heavy';
    if (code === 71 || code === 73 || code === 75) return 'Snow fall: Slight, moderate, or heavy';
    if (code === 77) return 'Snow grains';
    if (code === 80 || code === 81 || code === 82) return 'Rain showers: Slight, moderate, or violent';
    if (code === 85 || code === 86) return 'Snow showers: Slight or heavy';
    if (code === 95) return 'Thunderstorm: Slight or moderate';
    if (code === 96 || code === 99) return 'Thunderstorm with slight or heavy hail';
    return 'Unknown weather conditions';
  }
}
