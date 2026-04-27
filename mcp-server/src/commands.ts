/**
 * Shared module for slash command installation
 *
 * Used by index.ts (auto-install on MCP server startup and `update` subcommand)
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, renameSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface InstallResult {
  success: boolean;
  installed: string[];
  removed: string[];
  error?: string;
}

/** Old command filenames that should be pruned on upgrade */
const DEPRECATED_COMMANDS = [
  'codex.md',
  'gemini.md',
  'multi.md',
  'codex-xhigh.md',
  'ask-codex.md',
  'ask-gemini.md',
  'ask-multi.md',
  'multi-review-adv.md',
  // Removed in favor of /multi-review and /multi-consult only:
  'codex-review.md',
  'codex-xhigh-review.md',
  'gemini-review.md',
  'claude-review.md',
];

/**
 * Get source and target paths for command files
 */
export function getCommandPaths(): { source: string; target: string } {
  return {
    source: join(__dirname, '..', 'commands'),
    target: join(homedir(), '.claude', 'commands'),
  };
}

/**
 * Install slash commands to ~/.claude/commands/
 *
 * @param overrides Test-only path overrides; production callers pass nothing.
 * @returns Result object with success status and installed commands
 */
export function installCommands(overrides?: Partial<{ source: string; target: string }>): InstallResult {
  const defaults = getCommandPaths();
  const source = overrides?.source ?? defaults.source;
  const target = overrides?.target ?? defaults.target;

  // Check source exists
  if (!existsSync(source)) {
    return { success: false, installed: [], removed: [], error: 'Commands directory not found' };
  }

  // Create target directory, handle errors (not a dir, permission denied)
  try {
    if (existsSync(target)) {
      if (!statSync(target).isDirectory()) {
        return { success: false, installed: [], removed: [], error: `${target} exists but is not a directory` };
      }
    } else {
      mkdirSync(target, { recursive: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, installed: [], removed: [], error: `Cannot create target directory: ${msg}` };
  }

  const files = readdirSync(source).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    return { success: false, installed: [], removed: [], error: 'No command files found' };
  }

  // Prune deprecated commands from target by renaming to .deprecated.bak
  // (lossless — preserves any user edits the operator may have made). If the
  // backup already exists from a previous upgrade, leave it alone.
  const removed: string[] = [];
  for (const oldFile of DEPRECATED_COMMANDS) {
    const oldPath = join(target, oldFile);
    if (existsSync(oldPath)) {
      const backupPath = `${oldPath}.deprecated.bak`;
      try {
        if (!existsSync(backupPath)) {
          renameSync(oldPath, backupPath);
        }
        // If the backup already exists, the original was already moved on a
        // prior install. The file we see now must be a recreation; leave it
        // alone — the user clearly wants it.
        removed.push(oldFile.replace('.md', ''));
      } catch {
        // Best-effort removal — don't fail the install
      }
    }
  }

  // Copy current files
  const installed: string[] = [];
  try {
    for (const file of files) {
      copyFileSync(join(source, file), join(target, file));
      installed.push(file.replace('.md', ''));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, installed, removed, error: `Copy failed: ${msg}` };
  }

  return { success: true, installed, removed };
}
