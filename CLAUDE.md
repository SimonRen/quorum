# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

All commands run from `mcp-server/`:

```bash
npm install           # Install dependencies
npm run build         # Build TypeScript to dist/
npm run dev           # Watch mode (tsc --watch)
npm test              # Run vitest tests
npm run test:watch    # Watch mode tests
npm start             # Run the MCP server
```

Run a single test:
```bash
npm test -- --filter="pipeline"
npm test -- --filter="schema"
```

## Publishing

Release-based publish via npm Trusted Publishing (OIDC, no tokens needed).
CI triggers on GitHub Release, validates the tag matches `package.json`.

```bash
# 1. Bump version in package.json
# 2. Rebuild and test
cd mcp-server && npm run build && npm test
# 3. Commit, tag, push, release
git add -A && git commit -m "v1.x.x"
git tag v1.x.x
git push && git push --tags
gh release create v1.x.x --title "v1.x.x" --generate-notes
```

## Architecture

### MCP Server (`mcp-server/src/`)

This is an MCP (Model Context Protocol) server that provides AI review and consultation tools to Claude Code. External AI CLIs (Codex, Gemini, Claude Opus with fresh context) act as reviewers and consultants.

**Tools** (`multi_review`, `multi_consult`):
1. `multi_review` — review CC-produced work (plan, findings, code). Each model runs standard + adversarial passes. Requires `ccOutput`.
2. `multi_consult` — ask all models the same question and synthesize a 5-section structured response per model. For consultation/Q&A.

**Key Modules:**

- `index.ts` - MCP server entry point, tool routing, `update` subcommand, auto-installs slash commands on startup. Version read dynamically from `package.json`
- `commands.ts` - Slash command installer. Copies commands to `~/.claude/commands/`; deprecated commands are renamed to `.deprecated.bak` (lossless) on upgrade
- `tools/feedback.ts` - Review tool: `handleMultiReview`, `formatResult`, `TOOL_DEFINITIONS.multi_review`
- `tools/consult.ts` - Consult tool: `handleMultiConsult`, `ConsultInputSchema`, `validateConsultSections`, `checkSensitiveWorkingDir`, `MULTI_CONSULT_TOOL_DEFINITION`
- `consult-prompt.ts` - `buildConsultPrompt(request)` — produces the identical 5-section template sent to each adapter for consult requests
- `adapters/base.ts` - `ReviewerAdapter` interface (required `runReview` and `runConsult`), `ReviewRequest`/`ConsultRequest` types, registry
- `adapters/codex.ts`, `gemini.ts`, `claude.ts` - CLI-specific implementations. `runConsult` delegates to the same private `runCli` that `runReview` calls (no spawn-path duplication)
- `pipeline.ts` - Review finding verification pipeline. `FileCache`, path-traversal protection
- `schema.ts` - Zod schemas for review output
- `handoff.ts` - Review handoff protocol: `buildHandoffPrompt()`, `buildAdversarialHandoffPrompt()`
- `context.ts` - Review context with verification data
- `config.ts` - Runtime config (`~/.config/quorum/config.json`). Includes consult-specific Codex knobs `consultReasoningEffort` (default `xhigh`) and `consultServiceTier` (default `fast`)

**Design Principles:**
- CC is primary - external models assist; CC always judges and synthesizes
- Working directory strategy - pass cwd + small context; external CLIs read files directly
- Synthesis not passthrough - CC always judges external feedback before incorporating
- Consult: synthesis-only output to user, plus mandatory "Models said:" provenance footer

### Slash Commands (`commands/`)

Markdown files that define user-facing commands (auto-installed to `~/.claude/commands/`):
- `/multi-review` - Parallel standard + adversarial reviews from all CLIs (Codex, Gemini, Claude). For reviewing CC-produced work.
- `/multi-consult` - Ask all CLIs the same question and synthesize their answers. For consultation/Q&A.

## External CLI Requirements

At least one must be installed:
```bash
npm install -g @openai/codex-cli && codex login
npm install -g @google/gemini-cli && gemini
```

## Testing

Tests are in `mcp-server/src/__tests__/`:
- `pipeline.test.ts` - Path traversal security, file caching, verification logic
- `schema.test.ts` - Zod schema validation for review schemas

## Adding a New Adapter

To add support for a new AI CLI:
1. Create `adapters/<name>.ts` implementing `ReviewerAdapter` interface
2. Register adapter via `registerAdapter()` in `adapters/index.ts`
3. Adapter must implement `isAvailable()`, `getCapabilities()`, and `runReview()`
