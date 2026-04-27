/**
 * Tests for installCommands — focus on the deprecated-command pruning behavior.
 *
 * Critical regression: prior version called unlinkSync, silently destroying
 * user-edited slash commands. New behavior renames to .deprecated.bak so
 * customizations are recoverable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installCommands } from '../commands.js';

const TMP_ROOT = join(tmpdir(), `cc-reviewer-commands-test-${process.pid}`);

function setup(): { source: string; target: string } {
  const source = join(TMP_ROOT, 'source');
  const target = join(TMP_ROOT, 'target');
  mkdirSync(source, { recursive: true });
  mkdirSync(target, { recursive: true });
  return { source, target };
}

describe('installCommands — deprecated command pruning', () => {
  beforeEach(() => {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  afterEach(() => {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('renames a deprecated command to .deprecated.bak instead of deleting', () => {
    const { source, target } = setup();
    writeFileSync(join(source, 'multi-review.md'), '# multi review');

    // User has a (possibly customized) deprecated slash command file:
    const userFile = join(target, 'codex-review.md');
    writeFileSync(userFile, '# my customized review prompt');

    const result = installCommands({ source, target });

    expect(result.success).toBe(true);
    expect(result.removed).toContain('codex-review');

    // Original file no longer exists at the original path…
    expect(existsSync(userFile)).toBe(false);
    // …but its content is preserved in the backup:
    const backup = `${userFile}.deprecated.bak`;
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(backup, 'utf-8')).toBe('# my customized review prompt');
  });

  it('preserves the original backup when run twice (does not overwrite first backup)', () => {
    const { source, target } = setup();
    writeFileSync(join(source, 'multi-review.md'), '# multi review');

    // First user customization → run install → backup created.
    const userFile = join(target, 'codex-review.md');
    writeFileSync(userFile, 'first user version');
    installCommands({ source, target });

    const backup = `${userFile}.deprecated.bak`;
    expect(readFileSync(backup, 'utf-8')).toBe('first user version');

    // User somehow recreates the deprecated file (e.g. installs an old plugin
    // again) and edits it. Run install again.
    writeFileSync(userFile, 'second user version');
    installCommands({ source, target });

    // The first backup must still hold the original — we don't clobber it.
    expect(readFileSync(backup, 'utf-8')).toBe('first user version');
  });

  it('skips deprecated rename when the file does not exist at target', () => {
    const { source, target } = setup();
    writeFileSync(join(source, 'multi-review.md'), '# multi review');

    const result = installCommands({ source, target });

    expect(result.success).toBe(true);
    // Nothing was at target → nothing in `removed`.
    expect(result.removed).toEqual([]);
  });

  it('still installs current commands after pruning deprecated ones', () => {
    const { source, target } = setup();
    writeFileSync(join(source, 'multi-review.md'), '# multi review');
    writeFileSync(join(source, 'multi-consult.md'), '# multi consult');

    writeFileSync(join(target, 'gemini-review.md'), 'old user prompt');

    const result = installCommands({ source, target });

    expect(result.success).toBe(true);
    expect(result.installed).toContain('multi-review');
    expect(result.installed).toContain('multi-consult');
    expect(existsSync(join(target, 'multi-review.md'))).toBe(true);
    expect(existsSync(join(target, 'multi-consult.md'))).toBe(true);
    // Old file moved to backup:
    expect(existsSync(join(target, 'gemini-review.md.deprecated.bak'))).toBe(true);
  });
});
