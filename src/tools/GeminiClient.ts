import { GoogleGenerativeAI } from '@google/generative-ai';

export interface IGeminiClient {
  generate(prompt: string, jsonMode?: boolean): Promise<string>;
}

export class GeminiClient implements IGeminiClient {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async generate(prompt: string, jsonMode: boolean = false): Promise<string> {
    const generationConfig = jsonMode ? { responseMimeType: 'application/json' } : undefined;
    
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (!text) {
      throw new Error('Received empty response from Gemini API.');
    }
    return text;
  }
}
