/**
 * MCP Tool Implementations — Review Tools
 *
 * Returns raw reviewer text to CC. No JSON parsing, no reformatting.
 * CC handles interpretation and synthesis.
 */
import { z } from 'zod';
import { getAvailableAdapters, } from '../adapters/index.js';
// =============================================================================
// INPUT SCHEMAS
// =============================================================================
export const ReviewInputSchema = z.object({
    workingDir: z.string().describe('Working directory for the CLI to operate in'),
    ccOutput: z.string().describe("Claude Code's output to review (findings, plan, analysis)"),
    outputType: z.enum(['plan', 'findings', 'analysis', 'proposal']).describe('Type of output being reviewed'),
    analyzedFiles: z.array(z.string()).optional().describe('File paths that CC analyzed'),
    focusAreas: z.array(z.enum([
        'security', 'performance', 'architecture', 'correctness',
        'maintainability', 'scalability', 'testing', 'documentation'
    ])).optional().describe('Areas to focus the review on'),
    customPrompt: z.string().optional().describe('Custom instructions for the reviewer'),
    reasoningEffort: z.enum(['high', 'xhigh']).optional().describe('Codex reasoning effort level (default: high, use xhigh for deeper analysis)'),
    serviceTier: z.enum(['default', 'fast', 'flex']).optional().describe('Codex service tier (default when omitted: fast = priority processing, ~2x cost; flex = 50% cheaper/slower; default = API default tier)')
});
// =============================================================================
// HELPERS
// =============================================================================
function toReviewRequest(input) {
    return {
        workingDir: input.workingDir,
        ccOutput: input.ccOutput,
        outputType: input.outputType,
        analyzedFiles: input.analyzedFiles,
        focusAreas: input.focusAreas,
        customPrompt: input.customPrompt,
        reasoningEffort: input.reasoningEffort,
        serviceTier: input.serviceTier,
    };
}
function formatResult(result, modelName) {
    if (!result.success) {
        const emoji = {
            cli_not_found: '❌', timeout: '⏱️', rate_limit: '🚫',
            auth_error: '🔐', cli_error: '❌',
        };
        let msg = `${emoji[result.error.type] || '❌'} **${result.error.type}**: ${result.error.message}`;
        if (result.suggestion)
            msg += `\n\n💡 ${result.suggestion}`;
        return msg;
    }
    return `## ${modelName} Review\n\n**Execution Time:** ${(result.executionTimeMs / 1000).toFixed(1)}s\n\n${result.output}`;
}
// =============================================================================
// MULTI-MODEL HANDLER
// =============================================================================
export async function handleMultiReview(input) {
    const request = toReviewRequest(input);
    const availableAdapters = await getAvailableAdapters();
    if (availableAdapters.length === 0) {
        return { content: [{ type: 'text', text: '❌ No AI CLIs found.\n\nInstall at least one:\n  - Codex: npm install -g @openai/codex-cli\n  - Gemini: npm install -g @google/gemini-cli' }] };
    }
    // Spawn 2 reviews per adapter: standard + adversarial (all in parallel)
    // customPrompt steers the adversarial focus only — strip it from standard pass to avoid bias
    const { customPrompt, ...standardRequest } = request;
    const reviewPromises = availableAdapters.flatMap((adapter) => [
        adapter.runReview({ ...standardRequest }).then(result => ({ adapter, result, mode: 'standard' })),
        adapter.runReview({ ...request, reviewMode: 'adversarial' }).then(result => ({ adapter, result, mode: 'adversarial' })),
    ]);
    const results = await Promise.all(reviewPromises);
    const standardResults = results.filter(r => r.mode === 'standard');
    const adversarialResults = results.filter(r => r.mode === 'adversarial');
    const allFailed = results.every(r => !r.result.success);
    const someFailed = results.some(r => !r.result.success);
    const lines = [];
    if (allFailed)
        lines.push('## Multi-Model Review ❌ All Failed\n');
    else if (someFailed)
        lines.push('## Multi-Model Review ⚠️ Partial Success\n');
    else
        lines.push('## Multi-Model Review ✓\n');
    lines.push(`**Models:** ${availableAdapters.map(a => a.id).join(', ')} (standard + adversarial)\n`);
    // Standard section
    lines.push('## Standard Review Findings\n');
    for (const { adapter, result } of standardResults) {
        lines.push(formatResult(result, adapter.getCapabilities().name));
        lines.push('');
    }
    // Adversarial section
    lines.push('## Challenge Review Findings\n');
    for (const { adapter, result } of adversarialResults) {
        lines.push(formatResult(result, `${adapter.getCapabilities().name} (Adversarial)`));
        lines.push('');
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
}
// =============================================================================
// TOOL DEFINITIONS
// =============================================================================
export const TOOL_DEFINITIONS = {
    multi_review: {
        name: 'multi_review',
        description: "Use when reviewing existing CC-produced work (plan, findings, code). Requires 'ccOutput' — CC's prior output to evaluate. Runs parallel standard AND adversarial reviews from all available models. For asking the panel an open question with no prior CC-produced work to review, use 'multi_consult' instead. The discriminator is the shape of the input, not the user's phrasing.",
        inputSchema: {
            type: 'object',
            properties: {
                workingDir: { type: 'string', description: 'Working directory for the CLI to operate in' },
                ccOutput: { type: 'string', description: "Claude Code's output to review (findings, plan, analysis)" },
                outputType: { type: 'string', enum: ['plan', 'findings', 'analysis', 'proposal'], description: 'Type of output being reviewed' },
                analyzedFiles: { type: 'array', items: { type: 'string' }, description: 'File paths that CC analyzed' },
                focusAreas: { type: 'array', items: { type: 'string', enum: ['security', 'performance', 'architecture', 'correctness', 'maintainability', 'scalability', 'testing', 'documentation'] }, description: 'Areas to focus the review on' },
                customPrompt: { type: 'string', description: 'Custom instructions for standard review + adversarial focus steering' },
                serviceTier: { type: 'string', enum: ['default', 'fast', 'flex'], description: 'Codex service tier — only applies to Codex. Omit for fast default; fast = priority ~2x cost, flex = 50% cheaper/slower, default = API default tier.' }
            },
            required: ['workingDir', 'ccOutput', 'outputType']
        }
    },
};
