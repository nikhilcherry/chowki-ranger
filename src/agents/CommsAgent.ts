import path from 'path';
import { BaseAgent } from './BaseAgent.js';
import { Bundle } from '../types/Bundle.js';
import { TriageResult, CommsResult } from '../types/AgentResult.js';
import { IFilesystemTool } from '../tools/FilesystemTool.js';
import { cleanAndParseJson } from '../utils/json.js';

export class CommsAgent extends BaseAgent {
  private fsTool: IFilesystemTool;
  private outboxDir: string;

  constructor(
    geminiClient: any,
    logger: any,
    fsTool: IFilesystemTool,
    outboxDir: string
  ) {
    super(geminiClient, logger);
    this.fsTool = fsTool;
    this.outboxDir = outboxDir;
  }

  async execute(bundle: Bundle, triage: TriageResult): Promise<CommsResult> {
    this.logger.log('CommsAgent', `Drafting emergency communications for bundle ${bundle.id}`);

    const prompt = `
You are the CommsAgent of the Chowki Ranger Station. Your role is to draft emergency communications based on a distress bundle and its triage evaluation.

INPUT BUNDLE:
- Sender ID: ${bundle.senderId}
- Original Message: "${bundle.message}"
- Coordinates: Lat ${bundle.latitude}, Lon ${bundle.longitude}

TRIAGE EVALUATION:
- Evaluated Severity: ${triage.severity}
- Triage Confidence: ${triage.confidence}
- Recommended Actions: ${triage.actions.join(', ')}

TASK:
1. Draft a concise, reassuring SMS update to be queued for the hiker's family. (Keep it professional, informative, under 160 characters if possible, explaining that Rangers are acting).
2. Draft a highly detailed, professional Rescue Dispatch Brief for Ranger deployment. Include coordinates, original message, severity, and the specific triage recommendations.

CRITICAL INSTRUCTION:
You must respond ONLY with a valid JSON object matching this schema:
{
  "familySms": "string",
  "dispatchBrief": "string"
}
`;

    try {
      const responseText = await this.geminiClient.generate(prompt, true);
      const result = cleanAndParseJson<CommsResult>(responseText);

      // Save drafts to the outbox directory
      const familyPath = path.join(this.outboxDir, 'family.txt');
      const dispatchPath = path.join(this.outboxDir, 'dispatch.txt');

      this.fsTool.writeFile(familyPath, result.familySms);
      this.fsTool.writeFile(dispatchPath, result.dispatchBrief);

      this.logger.log('CommsAgent', `Saved family SMS draft to ${familyPath}`);
      this.logger.log('CommsAgent', `Saved dispatch brief to ${dispatchPath}`);

      // Print to console using logger
      this.logger.info('CommsAgent', `[Family SMS Draft]:\n--------------------\n${result.familySms}\n--------------------`);
      this.logger.info('CommsAgent', `[Rescue Dispatch Brief]:\n--------------------\n${result.dispatchBrief}\n--------------------`);

      return result;
    } catch (err) {
      this.logger.error('CommsAgent', err);
      // Fallback in case of API failure
      const fallbackFamily = `Emergency Alert: Ranger station is acting on a report from ${bundle.senderId} at Lat ${bundle.latitude}, Lon ${bundle.longitude}. Please standby.`;
      const fallbackDispatch = `RESCUE BRIEF: Sender: ${bundle.senderId}. Lat: ${bundle.latitude}, Lon: ${bundle.longitude}. Msg: ${bundle.message}. Severity: ${triage.severity}. Actions: ${triage.actions.join(', ')}`;

      const familyPath = path.join(this.outboxDir, 'family.txt');
      const dispatchPath = path.join(this.outboxDir, 'dispatch.txt');

      this.fsTool.writeFile(familyPath, fallbackFamily);
      this.fsTool.writeFile(dispatchPath, fallbackDispatch);

      return {
        familySms: fallbackFamily,
        dispatchBrief: fallbackDispatch
      };
    }
  }
}
