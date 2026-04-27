/**
 * Shared module for slash command installation
 *
 * Used by index.ts (auto-install on MCP server startup and `update` subcommand)
 */
export interface InstallResult {
    success: boolean;
    installed: string[];
    removed: string[];
    error?: string;
}
/**
 * Get source and target paths for command files
 */
export declare function getCommandPaths(): {
    source: string;
    target: string;
};
/**
 * Install slash commands to ~/.claude/commands/
 *
 * @param overrides Test-only path overrides; production callers pass nothing.
 * @returns Result object with success status and installed commands
 */
export declare function installCommands(overrides?: Partial<{
    source: string;
    target: string;
}>): InstallResult;
