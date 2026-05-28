/**
 * Tests for the Gemini adapter after the agy (Antigravity CLI) migration.
 *
 * The agy surface is materially different from gemini-cli: no --model,
 * no --output-format stream-json, no --include-directories, and the prompt
 * must be a positional argv after --print (stdin alone makes agy print help
 * and exit 0). These tests pin those contracts.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { setConfigPathForTesting } from '../config.js';

interface CapturedCall {
  command: string;
  args: string[];
  stdin: string | undefined;
}

const captured: CapturedCall[] = [];
let mockResult: { stdoutLines: string[]; rawStdout: string; stderr: string; exitCode: number; truncated: boolean } = {
  stdoutLines: ['mock review output'],
  rawStdout: 'mock review output',
  stderr: '',
  exitCode: 0,
  truncated: false,
};

vi.mock('../executor.js', () => {
  return {
    CliExecutor: class {
      command: string;
      args: string[];
      stdin: string | undefined;
      constructor(opts: { command: string; args: string[]; stdin?: string }) {
        this.command = opts.command;
        this.args = opts.args;
        this.stdin = opts.stdin;
        captured.push({ command: opts.command, args: opts.args, stdin: opts.stdin });
      }
      async run() {
        return mockResult;
      }
    },
  };
});

const { GeminiAdapter } = await import('../adapters/gemini.js');

const REVIEW_REQUEST = {
  workingDir: process.cwd(),
  ccOutput: 'plan: do X and Y',
  outputType: 'analysis' as const,
};

const CONSULT_REQUEST = {
  workingDir: process.cwd(),
  question: 'what would be the best approach?',
};

// Isolate from the user's real config — defaults only.
setConfigPathForTesting('/tmp/__quorum_test_gemini_agy/config.json');
afterAll(() => setConfigPathForTesting(null));

describe('GeminiAdapter (agy) — spawn contract', () => {
  beforeEach(() => {
    captured.length = 0;
    mockResult = {
      stdoutLines: ['mock review output'],
      rawStdout: 'mock review output',
      stderr: '',
      exitCode: 0,
      truncated: false,
    };
  });

  it('spawns the `agy` binary, not `gemini`', async () => {
    await new GeminiAdapter().runReview(REVIEW_REQUEST);

    expect(captured).toHaveLength(1);
    expect(captured[0].command).toBe('agy');
  });

  it('passes --sandbox, --add-dir <cwd>, --print <prompt> in that order', async () => {
    await new GeminiAdapter().runReview(REVIEW_REQUEST);

    const args = captured[0].args;
    expect(args[0]).toBe('--sandbox');
    expect(args[1]).toBe('--add-dir');
    expect(args[2]).toBe(REVIEW_REQUEST.workingDir);
    expect(args[3]).toBe('--print');
    // The prompt is the last positional — must be non-empty and not look like a flag.
    expect(args[4]).toBeDefined();
    expect(args[4].length).toBeGreaterThan(0);
    expect(args[4].startsWith('--')).toBe(false);
  });

  it('does NOT pass any of the removed gemini-cli flags', async () => {
    await new GeminiAdapter().runReview(REVIEW_REQUEST);

    const args = captured[0].args;
    // agy does not expose any of these; passing them would either error or be silently ignored.
    expect(args).not.toContain('--model');
    expect(args).not.toContain('--output-format');
    expect(args).not.toContain('--include-directories');
    expect(args).not.toContain('--approval-mode');
    expect(args).not.toContain('stream-json');
  });

  it('does NOT pipe the prompt via stdin (agy prints --help and exits 0 in that case)', async () => {
    await new GeminiAdapter().runReview(REVIEW_REQUEST);

    expect(captured[0].stdin).toBeUndefined();
  });

  it('uses the identical spawn contract for runConsult', async () => {
    await new GeminiAdapter().runConsult(CONSULT_REQUEST);

    expect(captured).toHaveLength(1);
    expect(captured[0].command).toBe('agy');
    const args = captured[0].args;
    expect(args.slice(0, 4)).toEqual(['--sandbox', '--add-dir', CONSULT_REQUEST.workingDir, '--print']);
    expect(args[4].length).toBeGreaterThan(0);
    expect(captured[0].stdin).toBeUndefined();
  });
});

describe('GeminiAdapter (agy) — output handling', () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it('returns cli_error when agy exits 0 with empty stdout', async () => {
    mockResult = { stdoutLines: [], rawStdout: '   \n', stderr: '', exitCode: 0, truncated: false };

    const result = await new GeminiAdapter().runReview(REVIEW_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('cli_error');
      expect(result.error.message).toMatch(/agy returned empty response/);
    }
  });

  it('maps OAuth-flavoured stderr to an auth_error', async () => {
    mockResult = { stdoutLines: [], rawStdout: '', stderr: 'oauth token expired, please re-authenticate', exitCode: 1, truncated: false };

    const result = await new GeminiAdapter().runReview(REVIEW_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('auth_error');
      expect(result.suggestion).toMatch(/agy/);
      expect(result.suggestion).toMatch(/OAuth/i);
    }
  });
});
