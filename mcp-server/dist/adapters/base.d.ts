/**
 * Base Adapter Interface for AI Reviewers
 *
 * This provides a generic interface that any AI CLI can implement.
 * Makes it easy to add new models (Ollama, Azure, etc.) without
 * changing the core orchestration logic.
 */
import { FocusArea, OutputType, ReasoningEffort, ServiceTier } from '../types.js';
export interface ReviewerCapabilities {
    /** Display name for this reviewer */
    name: string;
    /** Short description of the reviewer's strengths */
    description: string;
    /** Focus areas this reviewer excels at */
    strengths: FocusArea[];
    /** Focus areas this reviewer is weaker at */
    weaknesses: FocusArea[];
    /** Whether the reviewer can read files from the filesystem */
    hasFilesystemAccess: boolean;
    /** Whether the reviewer supports JSON structured output */
    supportsStructuredOutput: boolean;
    /** Maximum context window size (tokens) */
    maxContextTokens: number;
    /** Supported reasoning effort levels (if applicable) */
    reasoningLevels?: ReasoningEffort[];
}
export interface ReviewRequest {
    /** Working directory containing the code */
    workingDir: string;
    /** Claude Code's output to review */
    ccOutput: string;
    /** Type of output being reviewed */
    outputType: OutputType;
    /** Specific files that CC analyzed */
    analyzedFiles?: string[];
    /** Areas to focus the review on */
    focusAreas?: FocusArea[];
    /** Custom instructions from the user */
    customPrompt?: string;
    /** Reasoning effort level (for models that support it) */
    reasoningEffort?: ReasoningEffort;
    /** Service tier (Codex). Omit for the review chain's default 'fast' (priority). Pass 'flex' for cheap/slow or 'default' for the Codex API default tier. */
    serviceTier?: ServiceTier;
    /** Review mode: standard finds bugs, adversarial challenges assumptions */
    reviewMode?: 'standard' | 'adversarial';
}
export interface ConsultRequest {
    /** Working directory containing the code (always passed) */
    workingDir: string;
    /** CC-composed, self-contained question for the panel */
    question: string;
    /** CC-triaged file subset for code-grounded questions; omitted on general questions */
    relevantFiles?: string[];
    /** Free-form steering from $ARGUMENTS */
    customPrompt?: string;
    /** Reasoning effort (Codex). Default 'xhigh' for consult (deeper questions). */
    reasoningEffort?: ReasoningEffort;
    /** Service tier (Codex). Same defaulting rules as ReviewRequest. */
    serviceTier?: ServiceTier;
}
export type ConsultResult = ReviewResult;
/** @deprecated Use handoff.ts roles instead */
export interface ExpertRole {
    name: string;
    description: string;
    systemPrompt: string;
    focusAreas: FocusArea[];
    evaluationCriteria: string[];
}
/** @deprecated Use handoff.ts selectRole() instead */
export declare const EXPERT_ROLES: Record<string, ExpertRole>;
/** @deprecated Use handoff.ts selectRole() instead */
export declare function selectExpertRole(focusAreas?: FocusArea[]): ExpertRole;
export interface ReviewSuccess {
    success: true;
    output: string;
    executionTimeMs: number;
}
export interface ReviewFailure {
    success: false;
    error: ReviewError;
    suggestion?: string;
    rawOutput?: string;
    executionTimeMs: number;
}
export type ReviewResult = ReviewSuccess | ReviewFailure;
export interface ReviewError {
    type: 'cli_not_found' | 'timeout' | 'rate_limit' | 'auth_error' | 'invalid_response' | 'cli_error' | 'parse_error';
    message: string;
    details?: Record<string, unknown>;
}
/**
 * Base interface that all reviewer adapters must implement.
 * This allows easy addition of new AI CLIs without changing orchestration logic.
 */
export interface ReviewerAdapter {
    /** Unique identifier for this adapter */
    readonly id: string;
    /** Get capabilities and metadata for this reviewer */
    getCapabilities(): ReviewerCapabilities;
    /** Check if the CLI is available and properly configured */
    isAvailable(): Promise<boolean>;
    /** Run a review and return structured output */
    runReview(request: ReviewRequest): Promise<ReviewResult>;
    /** Run a consultation (Q&A) — required on every adapter. */
    runConsult(request: ConsultRequest): Promise<ConsultResult>;
    /**
     * Optional: Run peer review of another model's output
     * Future capability - not currently implemented by any adapter
     */
    runPeerReview?(originalRequest: ReviewRequest, reviewToScore: string): Promise<ReviewResult>;
}
export declare function registerAdapter(adapter: ReviewerAdapter): void;
export declare function getAdapter(id: string): ReviewerAdapter | undefined;
export declare function getAllAdapters(): ReviewerAdapter[];
export declare function getAvailableAdapters(): Promise<ReviewerAdapter[]>;
/**
 * Select the best available adapter for given focus areas
 */
export declare function selectBestAdapter(focusAreas?: FocusArea[]): Promise<ReviewerAdapter | null>;
