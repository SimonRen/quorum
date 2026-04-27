/**
 * MCP Tool — multi_consult
 *
 * Asks Codex, Gemini, and Claude (Opus) the same question in parallel.
 * Returns each model's structured 5-section response to CC for synthesis.
 */

import { z } from 'zod';
import { realpathSync } from 'fs';
import { resolve, sep } from 'path';
import { homedir } from 'os';
import { ConsultRequest, ConsultResult, ReviewerAdapter } from '../adapters/base.js';
import { getAvailableAdapters } from '../adapters/index.js';

// =============================================================================
// SENSITIVE PATH GUARD
// =============================================================================

/**
 * Returns the directory's *canonical* absolute path if it's safe to use as a
 * workingDir, or null if it resolves to a sensitive system location. We deny
 * roots like `/`, `/etc`, `~`, `~/.ssh`, etc. — paths *inside* a project root
 * are fine. The check resolves symlinks via realpath so a symlinked alias of
 * a sensitive directory is also caught.
 */
export function checkSensitiveWorkingDir(input: string): { ok: true; resolved: string } | { ok: false; reason: string } {
  let resolved: string;
  try {
    // realpath if it exists; otherwise fall back to resolve() so the standard
    // adapter cwd-existence check produces the user-visible error.
    resolved = realpathSync(input);
  } catch {
    resolved = resolve(input);
  }

  const home = homedir();
  const rawDenylist = [
    '/',
    '/etc',
    '/var',
    '/usr',
    '/bin',
    '/sbin',
    '/boot',
    '/root',
    home,
    `${home}${sep}.ssh`,
    `${home}${sep}.aws`,
    `${home}${sep}.config`,
    `${home}${sep}.gnupg`,
  ];

  // Resolve denylist symlinks too (e.g. macOS /etc -> /private/etc) so the
  // resolved-path comparison hits regardless of symlink direction.
  const denylist = new Set<string>();
  for (const path of rawDenylist) {
    denylist.add(path);
    try { denylist.add(realpathSync(path)); } catch { /* ignore — path doesn't exist */ }
  }

  if (denylist.has(resolved)) {
    return { ok: false, reason: `workingDir resolves to a sensitive path: ${resolved}` };
  }
  return { ok: true, resolved };
}

// =============================================================================
// SECTION VALIDATION
// =============================================================================

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
 * Lightweight check for the 5 expected `## …` headers in a model's consult
 * response. Behaviors:
 * - Strips fenced code blocks first so a quoted format-example skeleton
 *   doesn't falsely satisfy the check.
 * - Requires the section name as a word boundary at the start of an H2 line,
 *   but tolerates trailing decoration (colon, em-dash continuation, etc.).
 * - Case-sensitive on the section name. Bare bold (`**Recommendation**`),
 *   wrong level (`### Recommendation`), and ALL-CAPS variants all count as
 *   missing — that's the signal we want CC to see when models drift.
 */
export function validateConsultSections(output: string): SectionValidation {
  // Remove fenced code blocks so headers inside them don't satisfy the regex.
  const stripped = output.replace(/```[\s\S]*?```/g, '');

  const missing: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    // Match the exact section name at the start of an H2 header line.
    // `\b` after the name allows `:`, `—`, `-`, whitespace+more — but not
    // suffixed letters/digits (which would change the section name itself).
    const pattern = new RegExp(`^##\\s+${escapeRegex(section)}\\b[^\\n]*$`, 'm');
    if (!pattern.test(stripped)) {
      missing.push(section);
    }
  }
  return { missing };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// INPUT SCHEMA
// =============================================================================

export const ConsultInputSchema = z.object({
  workingDir: z.string().describe('Working directory for the CLI to operate in'),
  question: z.string().describe('CC-composed self-contained question for the panel'),
  relevantFiles: z.array(z.string()).optional().describe('CC-triaged file subset for code-grounded questions'),
  customPrompt: z.string()
    .optional()
    // Reject any literal `<user-steering` or `</user-steering` so a steering
    // value cannot escape the prompt envelope and inject instructions.
    .refine(v => !v || !/<\/?user-steering/i.test(v), {
      message: 'customPrompt must not contain <user-steering> tags',
    })
    .describe('Free-form steering from $ARGUMENTS'),
  reasoningEffort: z.enum(['high', 'xhigh']).optional().describe("Codex reasoning effort (default: 'xhigh' for consult)"),
  serviceTier: z.enum(['default', 'fast', 'flex']).optional().describe("Codex service tier (default: 'fast')"),
});

export type ConsultInput = z.infer<typeof ConsultInputSchema>;

// =============================================================================
// HANDLER
// =============================================================================

interface PerAdapterOutcome {
  adapter: ReviewerAdapter;
  result: ConsultResult;
}

function toConsultRequest(input: ConsultInput): ConsultRequest {
  return {
    workingDir: input.workingDir,
    question: input.question,
    relevantFiles: input.relevantFiles,
    customPrompt: input.customPrompt,
    reasoningEffort: input.reasoningEffort,
    serviceTier: input.serviceTier,
  };
}

function formatOutcome(outcome: PerAdapterOutcome): string {
  const { adapter, result } = outcome;
  const name = adapter.getCapabilities().name;
  if (!result.success) {
    const emoji: Record<string, string> = {
      cli_not_found: '❌', timeout: '⏱️', rate_limit: '🚫', auth_error: '🔐', cli_error: '❌',
    };
    let msg = `## ${name}\n${emoji[result.error.type] || '❌'} **${result.error.type}**: ${result.error.message}`;
    if (result.suggestion) msg += `\n\n💡 ${result.suggestion}`;
    return msg;
  }

  const drift = validateConsultSections(result.output);
  const driftLine = drift.missing.length > 0
    ? `⚠️ Format drift: missing sections [${drift.missing.join(', ')}]\n\n`
    : '';
  return `## ${name}\n**Execution Time:** ${(result.executionTimeMs / 1000).toFixed(1)}s\n\n${driftLine}${result.output}`;
}

export async function handleMultiConsult(
  input: ConsultInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Sensitive-cwd guard runs before any adapter dispatch — direct MCP callers
  // can't bypass the slash-command body's refusal by skipping CC.
  const guard = checkSensitiveWorkingDir(input.workingDir);
  if (!guard.ok) {
    return {
      content: [{
        type: 'text',
        text: `❌ Refused: ${guard.reason}\n\nInvoke /multi-consult from a project root, not a sensitive system path.`,
      }],
    };
  }

  const request = toConsultRequest(input);
  const adapters = await getAvailableAdapters();

  if (adapters.length === 0) {
    return {
      content: [{
        type: 'text',
        text: '❌ No AI CLIs found.\n\nInstall at least one:\n  - Codex: npm install -g @openai/codex-cli\n  - Gemini: npm install -g @google/gemini-cli',
      }],
    };
  }

  // Promise.allSettled — a rejected adapter must NOT collapse the whole call.
  const settled = await Promise.allSettled(
    adapters.map((adapter) => adapter.runConsult(request).then(
      (result) => ({ adapter, result }),
    )),
  );

  const outcomes: PerAdapterOutcome[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    const message = s.reason instanceof Error ? s.reason.message : String(s.reason);
    return {
      adapter: adapters[i],
      result: {
        success: false,
        error: { type: 'cli_error', message },
        suggestion: 'Adapter rejected — see error above',
        executionTimeMs: 0,
      },
    };
  });

  const allFailed = outcomes.every((o) => !o.result.success);
  const someFailed = outcomes.some((o) => !o.result.success);

  const lines: string[] = [];
  if (allFailed) lines.push('## Multi-Consult ❌ All Failed\n');
  else if (someFailed) lines.push('## Multi-Consult ⚠️ Partial Success\n');
  else lines.push('## Multi-Consult ✓\n');

  lines.push(`**Models:** ${adapters.map((a) => a.id).join(', ')}\n`);
  for (const outcome of outcomes) {
    lines.push(formatOutcome(outcome));
    lines.push('');
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// =============================================================================
// TOOL DEFINITION
// =============================================================================

export const MULTI_CONSULT_TOOL_DEFINITION = {
  name: 'multi_consult',
  description: "Use when asking the panel for guidance, recommendation, or approach (no prior CC-produced work to review). Input shape: 'question' only — no 'ccOutput'. For reviewing existing CC-produced work (plan, findings, code), use 'multi_review' (which requires 'ccOutput'). The discriminator is the shape of the input, not the user's phrasing.",
  inputSchema: {
    type: 'object',
    properties: {
      workingDir: { type: 'string', description: 'Working directory for the CLI to operate in' },
      question: { type: 'string', description: 'CC-composed self-contained question for the panel' },
      relevantFiles: { type: 'array', items: { type: 'string' }, description: 'CC-triaged file subset for code-grounded questions' },
      customPrompt: { type: 'string', description: 'Free-form steering from $ARGUMENTS' },
      reasoningEffort: { type: 'string', enum: ['high', 'xhigh'], description: "Codex reasoning effort (default: 'xhigh' for consult)" },
      serviceTier: { type: 'string', enum: ['default', 'fast', 'flex'], description: "Codex service tier (default: 'fast')" },
    },
    required: ['workingDir', 'question'],
  },
};
