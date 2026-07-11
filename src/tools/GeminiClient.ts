import { GoogleGenerativeAI } from '@google/generative-ai';

export interface IGeminiClient {
  generate(prompt: string, jsonMode?: boolean): Promise<string>;
}

export class GeminiClient implements IGeminiClient {
  private genAI: GoogleGenerativeAI | null = null;
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    if (apiKey && apiKey !== 'local') {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async generate(prompt: string, jsonMode: boolean = false): Promise<string> {
    // 1. Check if configured for local on-device execution first
    if (this.apiKey === 'local' || !this.genAI) {
      console.log('📡 [GeminiClient] Executing via Local On-Device Gemma 4 (Ollama)...');
      return this.generateLocalGemma(prompt, jsonMode);
    }

    try {
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
    } catch (err: any) {
      console.warn(`📡 [GeminiClient] Cloud Gemini API failed or offline: ${err.message}. Falling back to local Gemma 4...`);
      return this.generateLocalGemma(prompt, jsonMode);
    }
  }

  private async generateLocalGemma(prompt: string, jsonMode: boolean): Promise<string> {
    try {
      const res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4:e2b',
          messages: [{ role: 'user', content: prompt }],
          format: jsonMode ? 'json' : undefined,
          stream: false,
          options: { temperature: 0.2, num_ctx: 2048, num_predict: 512 }
        })
      });

      if (!res.ok) {
        throw new Error(`Local Ollama service returned status ${res.status}`);
      }

      const data = (await res.json()) as { message?: { content?: string } };
      const content = data.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('Local Ollama response contained no content');
      }
      return content;
    } catch (localErr: any) {
      throw new Error(`Satellite offline and local on-device Gemma 4 fallback failed: ${localErr.message}`);
    }
  }
}
