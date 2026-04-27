/**
 * MCP Tool — multi_consult
 *
 * Asks Codex, Gemini, and Claude (Opus) the same question in parallel.
 * Returns each model's structured 5-section response to CC for synthesis.
 */
import { z } from 'zod';
import { getAvailableAdapters } from '../adapters/index.js';
// =============================================================================
// SECTION VALIDATION
// =============================================================================
const REQUIRED_SECTIONS = [
    'Recommendation',
    'Reasoning',
    'Tradeoffs',
    'Risks',
    'Open questions for the asker',
];
/**
 * Lightweight regex check for the 5 expected `## …` headers in a model's
 * consult response. Headers must be at line start, exact case, optionally
 * followed by whitespace. Anything weaker (`**Recommendation**`,
 * `## RECOMMENDATION`) counts as missing — that's the signal we want CC
 * to see when models drift.
 */
export function validateConsultSections(output) {
    const missing = [];
    for (const section of REQUIRED_SECTIONS) {
        const pattern = new RegExp(`^##\\s+${escapeRegex(section)}\\s*$`, 'm');
        if (!pattern.test(output)) {
            missing.push(section);
        }
    }
    return { missing };
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// =============================================================================
// INPUT SCHEMA
// =============================================================================
export const ConsultInputSchema = z.object({
    workingDir: z.string().describe('Working directory for the CLI to operate in'),
    question: z.string().describe('CC-composed self-contained question for the panel'),
    relevantFiles: z.array(z.string()).optional().describe('CC-triaged file subset for code-grounded questions'),
    customPrompt: z.string().optional().describe('Free-form steering from $ARGUMENTS'),
    reasoningEffort: z.enum(['high', 'xhigh']).optional().describe("Codex reasoning effort (default: 'xhigh' for consult)"),
    serviceTier: z.enum(['default', 'fast', 'flex']).optional().describe("Codex service tier (default: 'fast')"),
});
function toConsultRequest(input) {
    return {
        workingDir: input.workingDir,
        question: input.question,
        relevantFiles: input.relevantFiles,
        customPrompt: input.customPrompt,
        reasoningEffort: input.reasoningEffort,
        serviceTier: input.serviceTier,
    };
}
function formatOutcome(outcome) {
    const { adapter, result } = outcome;
    const name = adapter.getCapabilities().name;
    if (!result.success) {
        const emoji = {
            cli_not_found: '❌', timeout: '⏱️', rate_limit: '🚫', auth_error: '🔐', cli_error: '❌',
        };
        let msg = `## ${name}\n${emoji[result.error.type] || '❌'} **${result.error.type}**: ${result.error.message}`;
        if (result.suggestion)
            msg += `\n\n💡 ${result.suggestion}`;
        return msg;
    }
    const drift = validateConsultSections(result.output);
    const driftLine = drift.missing.length > 0
        ? `⚠️ Format drift: missing sections [${drift.missing.join(', ')}]\n\n`
        : '';
    return `## ${name}\n**Execution Time:** ${(result.executionTimeMs / 1000).toFixed(1)}s\n\n${driftLine}${result.output}`;
}
export async function handleMultiConsult(input) {
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
    const settled = await Promise.allSettled(adapters.map((adapter) => adapter.runConsult(request).then((result) => ({ adapter, result }))));
    const outcomes = settled.map((s, i) => {
        if (s.status === 'fulfilled')
            return s.value;
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
    const lines = [];
    if (allFailed)
        lines.push('## Multi-Consult ❌ All Failed\n');
    else if (someFailed)
        lines.push('## Multi-Consult ⚠️ Partial Success\n');
    else
        lines.push('## Multi-Consult ✓\n');
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
