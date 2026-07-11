export const cleanAndParseJson = <T>(text: string): T => {
  let cleaned = text.trim();
  
  // Strip starting ```json or ```
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  
  // Strip ending ```
  cleaned = cleaned.replace(/\s*```$/, '');
  
  cleaned = cleaned.trim();
  
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    // If simple parse fails, try to find the first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(extracted) as T;
    }
    throw new Error(`Failed to parse JSON from response: "${text}". Inner error: ${err}`);
  }
};
