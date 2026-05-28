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

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import {
  ReviewerAdapter,
  ReviewerCapabilities,
  ReviewRequest,
  ReviewResult,
  ReviewError,
  ConsultRequest,
  ConsultResult,
  registerAdapter,
} from './base.js';
import { CliExecutor } from '../executor.js';
import {
  buildSimpleHandoff,
  buildHandoffPrompt,
  buildAdversarialHandoffPrompt,
  selectRole,
  FocusArea,
} from '../handoff.js';
import { buildConsultPrompt } from '../consult-prompt.js';
import { getConfig } from '../config.js';

const AGY_INSTALL_CMD = 'curl -fsSL https://antigravity.google/cli/install.sh | bash';

export class GeminiAdapter implements ReviewerAdapter {
  readonly id = 'gemini';

  getCapabilities(): ReviewerCapabilities {
    return {
      name: 'Gemini',
      description: 'Google Gemini (via Antigravity CLI) - excels at architecture analysis, design patterns, and large codebase understanding',
      strengths: ['architecture', 'maintainability', 'scalability', 'documentation'],
      weaknesses: ['security'],
      hasFilesystemAccess: true,
      supportsStructuredOutput: false,
      maxContextTokens: 2000000,
      reasoningLevels: undefined,
    };
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (result: boolean) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
      const proc = spawn('agy', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      proc.on('close', (code) => done(code === 0));
      proc.on('error', () => done(false));
      const timer = setTimeout(() => { proc.kill(); done(false); }, 5000);
    });
  }

  async runReview(request: ReviewRequest): Promise<ReviewResult> {
    const startTime = Date.now();

    if (!existsSync(request.workingDir)) {
      return {
        success: false,
        error: { type: 'cli_error', message: `Working directory does not exist: ${request.workingDir}` },
        suggestion: 'Check that the working directory path is correct',
        executionTimeMs: Date.now() - startTime,
      };
    }

    try {
      const handoff = buildSimpleHandoff(
        request.workingDir, request.ccOutput,
        request.analyzedFiles, request.focusAreas, request.customPrompt
      );
      const prompt = request.reviewMode === 'adversarial'
        ? buildAdversarialHandoffPrompt({ handoff })
        : buildHandoffPrompt({ handoff, role: selectRole(request.focusAreas as FocusArea[] | undefined) });

      const result = await this.runCli(prompt, request.workingDir);

      if (result.exitCode !== 0) {
        const error = this.categorizeError(result.stderr);
        return { success: false, error, suggestion: this.getSuggestion(error), executionTimeMs: Date.now() - startTime };
      }

      if (!result.stdout.trim()) {
        return {
          success: false,
          error: { type: 'cli_error', message: 'agy returned empty response' },
          suggestion: 'Try again or use /multi-review instead',
          executionTimeMs: Date.now() - startTime,
        };
      }

      return { success: true, output: result.stdout, executionTimeMs: Date.now() - startTime };
    } catch (error) {
      return this.handleException(error, startTime);
    }
  }

  private async runCli(
    prompt: string,
    workingDir: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number; truncated: boolean }> {
    const cfg = getConfig().gemini;
    // agy requires the prompt as the positional after --print; passing only via
    // stdin makes it print --help and exit 0. Sandbox keeps terminal-restricted
    // execution like the old gemini-cli's `--approval-mode plan`.
    const args = [
      '--sandbox',
      '--add-dir', workingDir,
      '--print', prompt,
    ];

    const cliStartTime = Date.now();
    console.error('[gemini] Running agy...');

    const executor = new CliExecutor({
      command: 'agy',
      args,
      cwd: workingDir,
      inactivityTimeoutMs: cfg.inactivityTimeoutMs,
      maxTimeoutMs: cfg.maxTimeoutMs,
      maxBufferSize: cfg.maxBufferSize,
    });

    const result = await executor.run();
    const elapsed = Math.round((Date.now() - cliStartTime) / 1000);
    console.error(`[gemini] ✓ complete (${elapsed}s)`);

    return {
      stdout: result.rawStdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      truncated: result.truncated,
    };
  }

  private handleException(error: unknown, startTime: number): ReviewResult {
    const err = error as Error & { code?: string };
    if (err.code === 'ENOENT') {
      return { success: false, error: { type: 'cli_not_found', message: 'agy CLI not found' },
        suggestion: `Install with: ${AGY_INSTALL_CMD}`, executionTimeMs: Date.now() - startTime };
    }
    if (err.message === 'TIMEOUT') {
      return { success: false, error: { type: 'timeout', message: 'agy timed out — no output received' },
        suggestion: 'Try a smaller scope or use /multi-review', executionTimeMs: Date.now() - startTime };
    }
    if (err.message === 'MAX_TIMEOUT') {
      return { success: false, error: { type: 'timeout', message: 'Task exceeded 60 minute maximum' },
        suggestion: 'Try a smaller scope', executionTimeMs: Date.now() - startTime };
    }
    return { success: false, error: { type: 'cli_error', message: err.message }, executionTimeMs: Date.now() - startTime };
  }

  private categorizeError(stderr: string): ReviewError {
    const lower = stderr.toLowerCase();
    if (lower.includes('rate limit') || lower.includes('quota')) {
      return { type: 'rate_limit', message: `Rate limit or quota exceeded: ${stderr.slice(0, 500)}` };
    }
    if (lower.includes('unauthorized') || lower.includes('authentication') || lower.includes('oauth') || stderr.includes('401') || stderr.includes('403')) {
      return { type: 'auth_error', message: `Authentication failed: ${stderr.slice(0, 500)}`, details: { stderr } };
    }
    return { type: 'cli_error', message: stderr.slice(0, 500) || 'Unknown error' };
  }

  private getSuggestion(error: ReviewError): string {
    switch (error.type) {
      case 'rate_limit': return 'Wait and retry, or use /multi-review instead';
      case 'auth_error': return 'Run `agy` and complete the Google OAuth sign-in';
      case 'cli_not_found': return `Install with: ${AGY_INSTALL_CMD}`;
      default: return 'Check the error message and try again';
    }
  }

  async runConsult(request: ConsultRequest): Promise<ConsultResult> {
    const startTime = Date.now();

    if (!existsSync(request.workingDir)) {
      return {
        success: false,
        error: { type: 'cli_error', message: `Working directory does not exist: ${request.workingDir}` },
        suggestion: 'Check that the working directory path is correct',
        executionTimeMs: Date.now() - startTime,
      };
    }

    try {
      const prompt = buildConsultPrompt(request);
      const result = await this.runCli(prompt, request.workingDir);

      if (result.exitCode !== 0) {
        const error = this.categorizeError(result.stderr);
        return { success: false, error, suggestion: this.getSuggestion(error), executionTimeMs: Date.now() - startTime };
      }

      if (!result.stdout.trim()) {
        return {
          success: false,
          error: { type: 'cli_error', message: 'agy returned empty response' },
          suggestion: 'Try again or use /multi-review instead',
          executionTimeMs: Date.now() - startTime,
        };
      }

      return { success: true, output: result.stdout, executionTimeMs: Date.now() - startTime };
    } catch (error) {
      return this.handleException(error, startTime);
    }
  }
}

registerAdapter(new GeminiAdapter());
export const geminiAdapter = new GeminiAdapter();
