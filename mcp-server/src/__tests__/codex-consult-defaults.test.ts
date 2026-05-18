/**
 * Tests for Codex adapter consult defaults.
 *
 * The spec mandates reasoningEffort='xhigh' and serviceTier='fast' as defaults
 * for runConsult — different from runReview's config-fallback defaults. This
 * test exists specifically to prevent silent regression to runReview's defaults
 * if a future refactor accidentally re-uses cfg.reasoningEffort.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { setConfigPathForTesting } from '../config.js';

type CapturedArgs = string[];
const capturedArgs: CapturedArgs[] = [];

vi.mock('../executor.js', () => {
  return {
    CliExecutor: class {
      args: string[];
      constructor(opts: { args: string[] }) {
        this.args = opts.args;
        capturedArgs.push(opts.args);
      }
      async run() {
        return { stdout: '', stderr: '', exitCode: 0, truncated: false, stdoutLines: [], rawStdout: '' };
      }
    },
  };
});

vi.mock('../decoders/index.js', () => {
  return {
    CodexEventDecoder: class {
      onProgress: unknown = null;
      processLine() {}
      getError() { return null; }
      getFinalResponse() { return 'ok'; }
      hasNoOutput() { return false; }
    },
  };
});

const { CodexAdapter } = await import('../adapters/codex.js');

function findArg(args: string[], prefix: string): string | undefined {
  return args.find((a) => typeof a === 'string' && a.startsWith(prefix));
}

setConfigPathForTesting('/tmp/__quorum_test_nonexistent/config.json');
afterAll(() => setConfigPathForTesting(null));

describe('CodexAdapter.runConsult — defaults', () => {
  beforeEach(() => {
    capturedArgs.length = 0;
  });

  it('defaults to model_reasoning_effort=xhigh when omitted', async () => {
    const adapter = new CodexAdapter();
    await adapter.runConsult({
      workingDir: process.cwd(),
      question: 'How should I shard this table?',
    });

    expect(capturedArgs).toHaveLength(1);
    expect(findArg(capturedArgs[0], 'model_reasoning_effort=')).toBe('model_reasoning_effort=xhigh');
  });

  it('defaults to service_tier=fast when omitted', async () => {
    const adapter = new CodexAdapter();
    await adapter.runConsult({
      workingDir: process.cwd(),
      question: 'q',
    });

    expect(findArg(capturedArgs[0], 'service_tier=')).toBe('service_tier=fast');
  });

  it("emits service_tier=flex when serviceTier='flex'", async () => {
    const adapter = new CodexAdapter();
    await adapter.runConsult({
      workingDir: process.cwd(),
      question: 'q',
      serviceTier: 'flex',
    });

    expect(findArg(capturedArgs[0], 'service_tier=')).toBe('service_tier=flex');
  });

  it("omits service_tier flag when serviceTier='default'", async () => {
    const adapter = new CodexAdapter();
    await adapter.runConsult({
      workingDir: process.cwd(),
      question: 'q',
      serviceTier: 'default',
    });

    expect(findArg(capturedArgs[0], 'service_tier=')).toBeUndefined();
  });

  it("emits model_reasoning_effort=high when reasoningEffort='high' (override)", async () => {
    const adapter = new CodexAdapter();
    await adapter.runConsult({
      workingDir: process.cwd(),
      question: 'q',
      reasoningEffort: 'high',
    });

    expect(findArg(capturedArgs[0], 'model_reasoning_effort=')).toBe('model_reasoning_effort=high');
  });
});

describe('CodexAdapter.runConsult — config respect', () => {
  const fixtureDir = join(tmpdir(), `quorum-consult-config-${process.pid}`);
  const fixturePath = join(fixtureDir, 'config.json');

  beforeEach(() => {
    capturedArgs.length = 0;
  });

  afterAll(() => {
    try { rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("respects cfg.codex.consultServiceTier when request omits serviceTier", async () => {
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(fixturePath, JSON.stringify({
      codex: { consultServiceTier: 'flex' },
    }), 'utf-8');
    setConfigPathForTesting(fixturePath);

    const adapter = new CodexAdapter();
    await adapter.runConsult({
      workingDir: process.cwd(),
      question: 'q',
    });

    expect(findArg(capturedArgs[0], 'service_tier=')).toBe('service_tier=flex');
  });

  it("respects cfg.codex.consultReasoningEffort when request omits reasoningEffort", async () => {
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(fixturePath, JSON.stringify({
      codex: { consultReasoningEffort: 'high' },
    }), 'utf-8');
    setConfigPathForTesting(fixturePath);

    const adapter = new CodexAdapter();
    await adapter.runConsult({
      workingDir: process.cwd(),
      question: 'q',
    });

    expect(findArg(capturedArgs[0], 'model_reasoning_effort=')).toBe('model_reasoning_effort=high');
  });

  it('explicit request value still overrides config', async () => {
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(fixturePath, JSON.stringify({
      codex: { consultServiceTier: 'flex', consultReasoningEffort: 'high' },
    }), 'utf-8');
    setConfigPathForTesting(fixturePath);

    const adapter = new CodexAdapter();
    await adapter.runConsult({
      workingDir: process.cwd(),
      question: 'q',
      serviceTier: 'fast',
      reasoningEffort: 'xhigh',
    });

    expect(findArg(capturedArgs[0], 'service_tier=')).toBe('service_tier=fast');
    expect(findArg(capturedArgs[0], 'model_reasoning_effort=')).toBe('model_reasoning_effort=xhigh');
  });
});
