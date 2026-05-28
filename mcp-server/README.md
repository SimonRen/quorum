# Quorum - Multi-Model AI Review & Consultation for Claude Code

Convene a quorum of AI models (OpenAI Codex, Google Gemini, Claude) to review Claude Code's work or answer questions — Claude Code synthesizes one verdict.

## Quick Install

**Step 1: Add the MCP server**
```bash
claude mcp add -s user quorum -- npx -y @simonren/quorum
```

**Step 2: Restart Claude Code**

The MCP tools and slash commands (`/multi-review`, `/multi-consult`) are automatically installed.

**Manual command install** (if needed):
```bash
npx -y @simonren/quorum update
```

Verify with:
```bash
claude mcp list
# quorum: npx -y @simonren/quorum - ✓ Connected
```

### Alternative: Manual Install

```bash
git clone https://github.com/SimonRen/quorum.git
cd quorum/mcp-server
npm install && npm run build
claude mcp add -s user quorum -- node /path/to/quorum/mcp-server/dist/index.js
```

## Prerequisites

Install at least one AI CLI:

```bash
# OpenAI Codex CLI
npm install -g @openai/codex-cli
codex login

# Google Gemini — via Antigravity CLI (`agy`). `gemini-cli` is sunset on 2026-06-18.
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy  # follow the Google OAuth flow
```

## Usage

These tools provide **external second-opinion reviews** from Codex and Gemini CLIs. They are designed to complement Claude Code's native review capabilities, not replace them.

**Slash commands:**
- `/multi-review` - Parallel standard + adversarial reviews from all available CLIs (Codex, Gemini, Claude). For reviewing CC-produced work (plan, findings, code).
- `/multi-consult` - Ask all CLIs the same question and synthesize their answers. For consultation/Q&A — what's the best approach, how to solve X.

**For regular reviews:** Just say "review" and Claude Code will use its native capabilities. These external tools are only invoked when explicitly requested.

## Slash Commands

These commands are available after restart:

```bash
/multi-review                          # Parallel standard + adversarial reviews from all CLIs
/multi-review focus on race conditions # Steer the adversarial focus
/multi-consult <question>              # Ask all CLIs and synthesize
/multi-consult <question> [flex]       # Use Codex flex tier (cheaper/slower)
```

## How It Works

```
CC does work → User: /multi-review → External CLIs review → CC synthesizes → Final output
User has a question → User: /multi-consult → External CLIs answer → CC synthesizes → Consolidated answer
```

**Key Principles:**
- **CC is primary**: Claude Code does all the work; external models only review
- **Working directory strategy**: Pass `cwd` + small CC output; external CLIs read files directly
- **Synthesis, not passthrough**: CC always judges external feedback before incorporating

## Focus Areas

| Area | Description |
|------|-------------|
| `security` | Vulnerabilities, auth, input validation |
| `performance` | Speed, memory, efficiency |
| `architecture` | Design patterns, structure, coupling |
| `correctness` | Logic errors, edge cases, bugs |
| `maintainability` | Code clarity, documentation, complexity |
| `scalability` | Load handling, bottlenecks |
| `testing` | Test coverage, test quality |
| `documentation` | Comments, docs, API docs |

## MCP Tools

The plugin exposes two MCP tools:

| Tool | Description |
|------|-------------|
| `multi_review` | Parallel standard + adversarial review from all available CLIs (Codex, Gemini, Claude). Requires `ccOutput`. |
| `multi_consult` | Ask all available CLIs the same question and receive a 5-section structured response per model. For consultation/Q&A. |

## Output Format

**Review tools** return structured feedback from the external CLIs. Claude Code parses this feedback to identify:
- **Findings**: Issues with severity, confidence, location, and suggestions
- **Agreements**: Validations of CC's correct assessments
- **Disagreements**: Challenges to CC's claims with corrections
- **Alternatives**: Different approaches with tradeoffs
- **Risk Assessment**: Overall risk level with top concerns

## Development

```bash
cd mcp-server
npm install
npm run build       # Build once
npm run dev         # Watch mode
npm test            # Run tests
npm run test:watch  # Watch mode tests
npm start           # Run server
```

## Publishing

Release-based publish via npm Trusted Publishing (OIDC, no tokens needed).
CI triggers on GitHub Release, validates the tag matches `package.json`.

```bash
# 1. Bump version in package.json
# 2. Rebuild and test
npm run build && npm test
# 3. Commit, tag, push, release
git add -A && git commit -m "v1.x.x"
git tag v1.x.x
git push && git push --tags
gh release create v1.x.x --title "v1.x.x" --generate-notes
```

## License

MIT
