import { BaseAgent } from './BaseAgent.js';
import { Bundle } from '../types/Bundle.js';
import { TriageResult } from '../types/AgentResult.js';
import { cleanAndParseJson } from '../utils/json.js';

export class TriageAgent extends BaseAgent {
  async execute(bundle: Bundle): Promise<TriageResult> {
    this.logger.log('TriageAgent', `Triaging bundle ${bundle.id} (Urgency: ${bundle.urgency})`);
    
    const prompt = `
You are the TriageAgent of the Chowki Ranger Station. Your sole responsibility is to assess incoming distress/status bundles exiting the offline trail mesh.
Analyze the message contents, the sender, and physical parameters to evaluate severity, confidence, and recommended ranger actions.

INPUT BUNDLE:
- Bundle ID: ${bundle.id}
- Sender: ${bundle.senderId}
- Declared Urgency: ${bundle.urgency}
- Location: Lat ${bundle.latitude}, Lon ${bundle.longitude}
- Timestamp: ${bundle.timestamp}
- Message: "${bundle.message}"

CRITICAL INSTRUCTIONS:
1. Determine the true evaluated severity: "LOW", "MEDIUM", "HIGH", or "CRITICAL".
2. Assess your confidence score (a float between 0.0 and 1.0) based on the clarity and specificity of the message.
3. Compile a list of recommended actions for the local ranger station staff.
4. NEVER contact external rescue services or trigger real SMS. Your outputs are purely informational.
5. You must respond ONLY with a valid JSON object following this strict schema:
{
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "confidence": number,
  "actions": string[]
}
`;

    try {
      const responseText = await this.geminiClient.generate(prompt, true);
      const result = cleanAndParseJson<TriageResult>(responseText);
      this.logger.log('TriageAgent', `Triage completed. Severity: ${result.severity}, Confidence: ${result.confidence}`);
      return result;
    } catch (err) {
      this.logger.error('TriageAgent', err);
      // Fallback in case of API failure: preserve the sender's own urgency
      // signal instead of collapsing everything below sos/critical to
      // MEDIUM -- a bundle declared 'high' by the sender must not be
      // silently downgraded just because the triage model call failed.
      const fallbackSeverity: TriageResult['severity'] =
        bundle.urgency === 'sos' || bundle.urgency === 'critical' ? 'CRITICAL'
        : bundle.urgency === 'high' ? 'HIGH'
        : bundle.urgency === 'low' ? 'LOW'
        : 'MEDIUM';
      return {
        severity: fallbackSeverity,
        confidence: 0.5,
        actions: ['Manually dispatch ranger due to agent triage failure']
      };
    }
  }
}
