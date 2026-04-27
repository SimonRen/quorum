/**
 * MCP Tool — multi_consult
 *
 * Asks Codex, Gemini, and Claude (Opus) the same question in parallel.
 * Returns each model's structured 5-section response to CC for synthesis.
 */
import { z } from 'zod';
/**
 * Returns the directory's *canonical* absolute path if it's safe to use as a
 * workingDir, or null if it resolves to a sensitive system location. We deny
 * roots like `/`, `/etc`, `~`, `~/.ssh`, etc. — paths *inside* a project root
 * are fine. The check resolves symlinks via realpath so a symlinked alias of
 * a sensitive directory is also caught.
 */
export declare function checkSensitiveWorkingDir(input: string): {
    ok: true;
    resolved: string;
} | {
    ok: false;
    reason: string;
};
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
export declare function validateConsultSections(output: string): SectionValidation;
export declare const ConsultInputSchema: z.ZodObject<{
    workingDir: z.ZodString;
    question: z.ZodString;
    relevantFiles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    customPrompt: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, string | undefined>;
    reasoningEffort: z.ZodOptional<z.ZodEnum<["high", "xhigh"]>>;
    serviceTier: z.ZodOptional<z.ZodEnum<["default", "fast", "flex"]>>;
}, "strip", z.ZodTypeAny, {
    workingDir: string;
    question: string;
    reasoningEffort?: "high" | "xhigh" | undefined;
    serviceTier?: "default" | "fast" | "flex" | undefined;
    relevantFiles?: string[] | undefined;
    customPrompt?: string | undefined;
}, {
    workingDir: string;
    question: string;
    reasoningEffort?: "high" | "xhigh" | undefined;
    serviceTier?: "default" | "fast" | "flex" | undefined;
    relevantFiles?: string[] | undefined;
    customPrompt?: string | undefined;
}>;
export type ConsultInput = z.infer<typeof ConsultInputSchema>;
export declare function handleMultiConsult(input: ConsultInput): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare const MULTI_CONSULT_TOOL_DEFINITION: {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            workingDir: {
                type: string;
                description: string;
            };
            question: {
                type: string;
                description: string;
            };
            relevantFiles: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            customPrompt: {
                type: string;
                description: string;
            };
            reasoningEffort: {
                type: string;
                enum: string[];
                description: string;
            };
            serviceTier: {
                type: string;
                enum: string[];
                description: string;
            };
        };
        required: string[];
    };
};
