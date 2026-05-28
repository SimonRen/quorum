/**
 * Gemini Adapter (via Antigravity CLI `agy`)
 *
 * Google replaced `gemini-cli` with the Antigravity CLI (`agy`) at I/O 2026.
 * The free-tier `gemini` binary stops serving requests on 2026-06-18, so this
 * adapter now spawns `agy --print` with the prompt on stdin. The model is still
 * Gemini under the hood — only the CLI brand changed — so the adapter id and
 * config key remain `gemini`.
 *
 * Differences from the old gemini-cli adapter:
 *   - No `--output-format stream-json` → no live progress events
 *   - No `--model` flag → model selection is done in agy's settings file
 *   - `--include-directories` → `--add-dir`
 *   - `--approval-mode plan` → folded into `--sandbox`
 */
import { ReviewerAdapter, ReviewerCapabilities, ReviewRequest, ReviewResult, ConsultRequest, ConsultResult } from './base.js';
export declare class GeminiAdapter implements ReviewerAdapter {
    readonly id = "gemini";
    getCapabilities(): ReviewerCapabilities;
    isAvailable(): Promise<boolean>;
    runReview(request: ReviewRequest): Promise<ReviewResult>;
    private runCli;
    private handleException;
    private categorizeError;
    private getSuggestion;
    runConsult(request: ConsultRequest): Promise<ConsultResult>;
}
export declare const geminiAdapter: GeminiAdapter;
