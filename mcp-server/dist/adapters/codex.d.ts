/**
 * Codex CLI Adapter
 *
 * Implements the ReviewerAdapter interface for OpenAI's Codex CLI.
 * Returns raw text — no JSON parsing or schema enforcement.
 * CC handles interpretation of the reviewer's response.
 */
import { ReviewerAdapter, ReviewerCapabilities, ReviewRequest, ReviewResult, ConsultRequest, ConsultResult } from './base.js';
export declare class CodexAdapter implements ReviewerAdapter {
    readonly id = "codex";
    getCapabilities(): ReviewerCapabilities;
    isAvailable(): Promise<boolean>;
    runReview(request: ReviewRequest): Promise<ReviewResult>;
    private runCli;
    private handleException;
    private categorizeError;
    private getSuggestion;
    runConsult(request: ConsultRequest): Promise<ConsultResult>;
}
export declare const codexAdapter: CodexAdapter;
