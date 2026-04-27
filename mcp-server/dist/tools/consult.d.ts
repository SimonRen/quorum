/**
 * MCP Tool — multi_consult
 *
 * Asks Codex, Gemini, and Claude (Opus) the same question in parallel.
 * Returns each model's structured 5-section response to CC for synthesis.
 */
import { z } from 'zod';
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
export declare function validateConsultSections(output: string): SectionValidation;
export declare const ConsultInputSchema: z.ZodObject<{
    workingDir: z.ZodString;
    question: z.ZodString;
    relevantFiles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    customPrompt: z.ZodOptional<z.ZodString>;
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
