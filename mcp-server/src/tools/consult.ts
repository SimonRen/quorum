/**
 * MCP Tool — multi_consult
 *
 * Asks Codex, Gemini, and Claude (Opus) the same question in parallel.
 * Returns each model's structured 5-section response to CC for synthesis.
 *
 * Task 3 establishes the validateConsultSections helper.
 * Task 7 fills out the handler, schema, and tool definition.
 */

const REQUIRED_SECTIONS = [
  'Recommendation',
  'Reasoning',
  'Tradeoffs',
  'Risks',
  'Open questions for the asker',
] as const;

export interface SectionValidation {
  missing: string[];
}

/**
 * Lightweight regex check for the 5 expected `## …` headers in a model's
 * consult response. Headers must be at line start, exact case, optionally
 * followed by whitespace. Anything weaker (`**Recommendation**`,
 * `## RECOMMENDATION`) counts as missing — that's the signal we want CC
 * to see when models drift.
 */
export function validateConsultSections(output: string): SectionValidation {
  const missing: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    const pattern = new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, 'm');
    if (!pattern.test(output)) {
      missing.push(section);
    }
  }
  return { missing };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
