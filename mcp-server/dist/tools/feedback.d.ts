/**
 * MCP Tool Implementations — Review Tools
 *
 * Returns raw reviewer text to CC. No JSON parsing, no reformatting.
 * CC handles interpretation and synthesis.
 */
import { z } from 'zod';
export declare const ReviewInputSchema: z.ZodObject<{
    workingDir: z.ZodString;
    ccOutput: z.ZodString;
    outputType: z.ZodEnum<["plan", "findings", "analysis", "proposal"]>;
    analyzedFiles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    focusAreas: z.ZodOptional<z.ZodArray<z.ZodEnum<["security", "performance", "architecture", "correctness", "maintainability", "scalability", "testing", "documentation"]>, "many">>;
    customPrompt: z.ZodOptional<z.ZodString>;
    reasoningEffort: z.ZodOptional<z.ZodEnum<["high", "xhigh"]>>;
    serviceTier: z.ZodOptional<z.ZodEnum<["default", "fast", "flex"]>>;
}, "strip", z.ZodTypeAny, {
    workingDir: string;
    ccOutput: string;
    outputType: "plan" | "findings" | "analysis" | "proposal";
    reasoningEffort?: "high" | "xhigh" | undefined;
    serviceTier?: "default" | "fast" | "flex" | undefined;
    customPrompt?: string | undefined;
    focusAreas?: ("security" | "performance" | "architecture" | "correctness" | "maintainability" | "scalability" | "testing" | "documentation")[] | undefined;
    analyzedFiles?: string[] | undefined;
}, {
    workingDir: string;
    ccOutput: string;
    outputType: "plan" | "findings" | "analysis" | "proposal";
    reasoningEffort?: "high" | "xhigh" | undefined;
    serviceTier?: "default" | "fast" | "flex" | undefined;
    customPrompt?: string | undefined;
    focusAreas?: ("security" | "performance" | "architecture" | "correctness" | "maintainability" | "scalability" | "testing" | "documentation")[] | undefined;
    analyzedFiles?: string[] | undefined;
}>;
export type ReviewInput = z.infer<typeof ReviewInputSchema>;
export declare function handleMultiReview(input: ReviewInput): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
}>;
export declare const TOOL_DEFINITIONS: {
    multi_review: {
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                workingDir: {
                    type: string;
                    description: string;
                };
                ccOutput: {
                    type: string;
                    description: string;
                };
                outputType: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                analyzedFiles: {
                    type: string;
                    items: {
                        type: string;
                    };
                    description: string;
                };
                focusAreas: {
                    type: string;
                    items: {
                        type: string;
                        enum: string[];
                    };
                    description: string;
                };
                customPrompt: {
                    type: string;
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
};
