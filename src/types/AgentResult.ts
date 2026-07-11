import { Bundle } from './Bundle.js';

export interface TriageResult {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  actions: string[];
}

export interface CommsResult {
  familySms: string;
  dispatchBrief: string;
}

export interface WeatherResult {
  hasAdvisory: boolean;
  summary: string;
  advisoryBundle?: {
    direction: 'uphill' | 'downhill' | 'all';
    urgency: 'advisory' | 'warning';
    message: string;
  };
}
