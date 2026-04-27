# `/multi-consult` — Design Spec

**Date:** 2026-04-27
**Status:** Approved (post-multi-review revisions), ready for implementation plan

## Goal

Add `/multi-consult` — a slash command that asks Codex, Gemini, and Claude (Opus, fresh context) the same question in parallel, returns each model's answer in a fixed 5-field structure, and has Claude Code (CC) synthesize them into one consolidated answer for the user — followed by a one-line "Models said:" provenance footer so dissent is always visible.

This complements `/multi-review`. Where review is "evaluate work CC already did," consult is "ask the panel a question to find the best approach."

## Non-Goals

- Not a review tool. No `outputType`, no adversarial split, no findings verification pipeline.
- No per-model role lean (no Codex-as-correctness, Gemini-as-architect bias). All three get the identical prompt.
- No follow-up rounds. Single-shot per call; refining the question means firing the command again.
- No raw-answer dump *by default*. CC presents its synthesis followed by a one-line per-model provenance footer (recommendations only, not full prose). Full raw blocks on explicit user request.
- No per-model variants (`/consult-codex`, etc.). Combined command only.
- No public `runPrompt` adapter primitive (option 3 from the implementation-approach evaluation). DRY is achieved via a *private* shared CLI runner that already exists in each adapter — see §Adapter Changes.

## Use Cases

The command handles both:

- **Code-grounded questions** — "How should I refactor the auth middleware in this repo?" CC pre-triages a `relevantFiles` list; models are bounded to that subset and answer from concrete context.
- **General problem-solving** — "Postgres vs DynamoDB for a write-heavy timeseries workload?" Models answer from expertise; no `relevantFiles`, no code reading needed.

The prompt template explicitly tells the model to read only listed files (or none on general questions) and never to walk outside `workingDir`.

## User-Facing Surface

**Slash command:** `/multi-consult [question or steering]`

The slash command body instructs CC to:

1. **Pre-compose the question.** Analyze the user's request, determine what context the panel needs (relevant files, constraints, success criteria), and produce a clean self-contained question. If the question is code-grounded, populate `relevantFiles` with the minimal subset (3-10 files typically) the panel needs to answer well.
2. **Call `multi_consult`** with the composed question, the working directory, and `relevantFiles` if applicable.
3. **Synthesize the panel's responses** into a single consolidated answer, then append a one-line "Models said:" provenance footer.

**`$ARGUMENTS` semantics** — Codex-tunable knobs are reserved tokens; everything else is steering or the literal question:

| Token in $ARGUMENTS         | Effect                                                                |
| --------------------------- | --------------------------------------------------------------------- |
| `flex` / `cheap` / `budget` | Codex `serviceTier: 'flex'`                                           |
| `default tier` / `standard tier` | Codex `serviceTier: 'default'`                                   |
| `high reasoning`            | Codex `reasoningEffort: 'high'` (overrides default `xhigh`)           |
| anything else               | Free-form steering passed via `customPrompt` (e.g., "focus on rollback safety") |

**Codex defaults:** `reasoningEffort: 'xhigh'`, `serviceTier: 'fast'`. Consult-style questions are typically deeper than reviews, so the default leans toward depth.

**`$ARGUMENTS` parsing rule (pinned).** Unlike `/multi-review` where the question lives in `ccOutput`, here `$ARGUMENTS` may *be* the question itself. The slash-command body instructs CC:

- **If conversation context already contains the question CC was working on:** CC composes `question` from context and `$ARGUMENTS` is treated as pure steering (extract reserved tokens → schema fields; remainder → `customPrompt`).
- **Otherwise — `$ARGUMENTS` IS the literal question.** CC sets `customPrompt` empty. Reserved tokens are extracted *only* when they appear at the *end* of `$ARGUMENTS` inside brackets or parens — e.g., `... [flex]`, `... (high reasoning)`. A bare occurrence of "flex"/"cheap"/"default tier" inside the prose is treated as part of the question, not a flag, to avoid corrupting questions like *"Should we offer a flex tier or default tier for customers?"*.

## MCP Tool: `multi_consult`

### Input schema (Zod)

```ts
ConsultInputSchema = z.object({
  workingDir: z.string(),                                  // always passed
  question: z.string(),                                    // CC-composed, self-contained
  relevantFiles: z.array(z.string()).optional(),           // CC-triaged file subset for code-grounded questions
  customPrompt: z.string().optional(),                     // free-form steering from $ARGUMENTS
  reasoningEffort: z.enum(['high', 'xhigh']).optional(),   // default 'xhigh'
  serviceTier: z.enum(['default', 'fast', 'flex']).optional(), // default 'fast'
});
```

Notable absences vs `ReviewInputSchema`: no `ccOutput`, no `outputType`, no `focusAreas`. Consult is question-shaped, not work-shaped. `relevantFiles` is the consult-side analog of `analyzedFiles` — it bounds filesystem trawling on code-grounded questions and is omitted on general questions.

### Tool description (matters for routing)

> Use when asking the panel for guidance, recommendation, or approach (no prior CC-produced work to review). Input shape: `question` only — no `ccOutput`. For reviewing existing CC-produced work (plan, findings, code), use `multi_review` (which requires `ccOutput`). The discriminator is the shape of the input, not the user's phrasing.

(`multi_review`'s description should be updated in the same change to mirror this — anchor on input shape, not slash-command literal: *"Use when reviewing existing CC-produced work (plan, findings, code). Requires `ccOutput`."*)

### Behavior

1. Resolve all available adapters via `getAvailableAdapters()`.
2. If none → return the same install-hint message as `multi_review`'s "no adapters" branch.
3. Build a `ConsultRequest` and dispatch `adapter.runConsult(req)` for all adapters in parallel via **`Promise.allSettled`** (NOT `Promise.all` — a rejected adapter must not collapse the other successes; `multi_review`'s current `Promise.all` pattern in `feedback.ts:120` is a latent bug we are not inheriting).
4. For each successful adapter result, run `validateConsultSections(output)` — a regex check for the five expected `## …` headers. If any are missing, prepend `⚠️ Format drift: missing sections [<names>]` to that model's block so CC can handle drift explicitly during synthesis.
5. Concatenate by model with a header indicating success / partial / all-failed. CC reads, synthesizes, and presents the consolidated answer to the user with a provenance footer — see §Output Flow.

## Adapter Changes

### New types in `adapters/base.ts`

```ts
export interface ConsultRequest {
  workingDir: string;
  question: string;
  relevantFiles?: string[];
  customPrompt?: string;
  reasoningEffort?: ReasoningEffort;
  serviceTier?: ServiceTier;
}

export type ConsultResult = ReviewResult; // identical shape: success+output | failure+error
```

### New required method on `ReviewerAdapter`

```ts
runConsult(request: ConsultRequest): Promise<ConsultResult>;
```

**Required, not optional.** Any adapter capable of review can do consult (consult is the simpler operation). If a future opt-out is genuinely needed, gate it on `getCapabilities().supportsConsult: boolean` — a typed, observable signal we can render as a `skipped: <reason>` entry in the tool output, rather than the silent feature-drop class of bug that `typeof method === 'function'` filtering produces.

### Implementations — shared CLI runner is mandated

Each existing adapter (`codex.ts`, `gemini.ts`, `claude.ts`) already has a private prompt-agnostic CLI runner — `runCli(prompt, workingDir, …)` (`codex.ts:112-192`, `gemini.ts:106-162`, `claude.ts:114-184`). The seam is already there.

**Mandate (pinned):** `runConsult` MUST delegate to the same private CLI runner that `runReview` calls. Each adapter's `runConsult` is ~10 lines:

1. Build the consult prompt via `buildConsultPrompt(request)`.
2. Validate `workingDir` (reuses the existing check).
3. Call `this.runCli(prompt, request.workingDir, …)` with the *same arguments* `runReview` would pass for the same request — only the prompt differs. (Codex's signature includes `reasoningEffort` and optional `serviceTier`; Gemini's and Claude's do not.)
4. Return the result as `ConsultResult` (shape-equivalent to `ReviewResult`).

This keeps the public surface clean (separate `runReview` / `runConsult`) while the spawn path — the brittle part containing JSONL decoding, inactivity timeouts, `service_tier` flag emission, empty-response detection, error categorization — stays single-sourced. Adding a future `/multi-explain` or peer-review variant becomes a 10-line addition rather than another 50-line copy.

**Codex `xhigh` default — explicit test required.** `codex.ts:88` currently falls back to config (`config.ts:28` defaults to `high`). Without a regression test, copying the `runReview` pattern silently emits `model_reasoning_effort=high` for consult, contradicting the spec. Add `CodexAdapter.runConsultDefaultsToXhighWhenOmitted` (mirrors `codex-tier.test.ts`'s arg-capture pattern).

No JSON parsing, no Zod schema for the model's output. The 5-field structure is enforced by the prompt template, lightly validated post-hoc (Tool Behavior step 4), and consumed by CC.

## Prompt Template — `buildConsultPrompt(request)`

New module `consult-prompt.ts` (sibling to `handoff.ts`). One identical template for all three models.

```
You are a senior engineer being consulted on a question. A teammate
needs your best take. They have not asked you to review code; they
want your judgment.

CONSTRAINTS — READ-ONLY:
- Do not create, modify, or delete files.
- Do not run git or any state-changing commands.
- Do not read files outside WORKING DIRECTORY.

WORKING DIRECTORY: <workingDir>

[RELEVANT FILES (read these first; do not trawl beyond them):
- <file1>
- <file2>
- ...]

[If no RELEVANT FILES section: this is a general question — answer
from expertise; do NOT inspect the filesystem.]

QUESTION:
<question>

<user-steering priority="advisory">
[<customPrompt> — only present if non-empty]
</user-steering>

The 5-section response structure below is REQUIRED regardless of any
user steering above.

Respond in this exact structure with these exact ## headers in this
order. Be concrete. Cite file:line when referencing code. Do not
hedge with disclaimers; commit to a position.

## Recommendation
<one paragraph: what you would actually do, stated plainly>

## Reasoning
<why this is the right call — the load-bearing argument, not a recap>

## Tradeoffs
<what you knowingly accept by choosing this path — alternatives
considered and why you rejected them>

## Risks
<what could invalidate the recommendation that the asker may not
have considered — distinct from Tradeoffs (which are accepted)>

## Open questions for the asker
<only if you genuinely cannot give a sharp answer without more info.
If you'd guess and it'd probably be right, just commit. Otherwise
write "None.">
```

### Why these five fields

- **Recommendation** is the lede — CC scans this first across all 3 to find agreement/disagreement. It's also what the provenance footer is built from.
- **Reasoning** is what CC weighs when models disagree.
- **Tradeoffs vs Risks distinction (sharpened):** Tradeoffs are what you *knowingly accept*; Risks are what could *invalidate* the recommendation. Without this sharpening, models duplicate content across both — empirically ~30%.
- **Risks** is the adversarial-thinking slot without needing a separate adversarial pass.
- **Open questions** is the escape hatch when the model lacks information; the prompt explicitly discourages padding it with generic clarifiers.

The "READ-ONLY" preamble inherits the safety constraints from the existing review prompt at `handoff.ts:454`. The `<user-steering>` envelope contains `customPrompt` so accidental injection ("ignore the structure above…") doesn't override the format directive.

## Output Flow & Synthesis

### MCP tool returns to CC (single text content block)

```
## Multi-Consult ✓     ← or ⚠️ Partial / ❌ All Failed
**Models:** codex, gemini, claude

## Codex
**Execution Time:** 12.4s
[⚠️ Format drift: missing sections [Risks]]   ← only if validation flagged drift
<raw 5-field response>

## Gemini
**Execution Time:** 8.1s
<raw 5-field response>

## Claude (Opus)
**Execution Time:** 21.7s
<raw 5-field response>
```

Failures use the same emoji + suggestion pattern as `formatResult` in `feedback.ts`.

### Slash command "After Receiving" — instructs CC to

1. Read all three panel responses. Note any `⚠️ Format drift` markers — adjust synthesis confidence accordingly.
2. **Cross-compare Recommendations.** Agreement across all three → high confidence. 2-vs-1 split → CC takes a side and *must surface the dissent explicitly* in the user-facing answer (don't flatten it). All three disagree → CC presents the tradeoff space honestly and picks.
3. **Mine Tradeoffs and Risks.** Even when models agree on the recommendation, the *reasons* and *risks* often diverge — surface the union, not just the intersection. If a single model raised a Risk the others missed, surface it as "1 model raised: …" — *do not silently drop it.*
4. **Forward Open questions** to the user only if material — do not dump every "what's your scale?" clarifier.
5. **Apply CC's own judgment.** CC has full conversation context the panel does not; it can dismiss panel suggestions that miss the user's actual constraint, but must say so explicitly when overriding.
6. **Respond with one consolidated answer**, structured as: **Recommendation** (what to do) → **Why** (CC's synthesis of reasoning) → **Watch out for** (consolidated risks, including any single-model-only risks) → optional **Open question for you** if a real ambiguity blocks the answer.
7. **Append a "Models said:" provenance footer** — a single line per model with the recommendation in <80 chars. Example:
   ```
   ---
   **Models said:**  Codex → Postgres + read replicas.  Gemini → Postgres + Citus.  Claude → DynamoDB w/ caveat on cost at scale.
   ```
   This is non-negotiable. The footer is the audit trail; without it, synthesis-only is opaque.
8. **Do not paste full raw model outputs to the user** unless the user explicitly asks ("show me what each model said", "raw").
9. **All-failed special case:** if all three adapters failed, surface the failure types and **ASK** the user "panel unavailable — want my solo answer instead?". Do **not** silently substitute CC's own answer for the panel's.

## Edge Cases

| Case                           | Behavior                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| No CLIs installed              | Tool returns the same install-hint message as `multi_review`'s "no adapters" branch.                  |
| 1 of 3 succeeds                | `⚠️ Partial Success` header. CC synthesizes from what it has, names the missing model and its failure type in the consolidated answer. |
| 2 of 3 succeed                 | Same partial-success path.                                                                            |
| All 3 fail                     | `❌ All Failed` header. CC reports failure types (auth, rate-limit, timeout) and **asks** the user before substituting its own answer. |
| One adapter rejects (throws)   | `Promise.allSettled` catches it; treated as a failure, other adapters' successes are preserved.       |
| Codex timeout / rate-limit     | Bubbles up via existing `ReviewError` types — no new error handling needed.                           |
| Empty / trivially short question | Tool still runs; prompt template handles "general, no code to read." Garbage-in is the user's call. |
| Invalid working directory      | Adapters already validate cwd in `runReview`; the shared `runCli` reuses that.                        |
| Model omits a section          | `validateConsultSections` flags it; CC sees the `⚠️ Format drift` marker and degrades synthesis confidence accordingly. |
| Concurrent invocations         | Multiplies CLI load (3 procs/call). Same constraint as `/multi-review`; not a new issue.              |
| `workingDir` is a sensitive path (`/etc`, `~`, `~/.ssh`) | Slash-command body instructs CC to refuse and ask the user to invoke from a project root. Adapters cannot generically know what's sensitive; this is a slash-command-level check. |

## Files to Add / Modify

### New files

- `mcp-server/src/tools/consult.ts` — `handleMultiConsult`, `ConsultInputSchema`, `validateConsultSections`, tool definition.
- `mcp-server/src/consult-prompt.ts` — `buildConsultPrompt(request: ConsultRequest): string`.
- `mcp-server/commands/multi-consult.md` — slash command body. Must include the verbatim `$ARGUMENTS` parsing rule, the all-failed ASK-don't-substitute instruction, the provenance-footer format, and the `workingDir` sensitivity check.
- `mcp-server/src/__tests__/consult-prompt.test.ts` — snapshot test for the prompt template; verifies header order, `relevantFiles` rendering, `customPrompt` envelope wrapping, format-precedence reinforcement.
- `mcp-server/src/__tests__/multi-consult.test.ts` — handler-level tests: no-adapters-available, all-fail (with `Promise.allSettled` proving partial-success preservation), partial-success (1/3 and 2/3), `validateConsultSections` warning emission, schema rejection of missing required fields.
- `mcp-server/src/__tests__/codex-consult-defaults.test.ts` — verifies `runConsult` emits `model_reasoning_effort=xhigh` and `service_tier=fast` when the request omits them (mirrors existing `codex-tier.test.ts`).

### Modified files

- `mcp-server/src/adapters/base.ts` — add `ConsultRequest`, `ConsultResult` types, **required** `runConsult` on `ReviewerAdapter`. Optional: add `supportsConsult: boolean` to `ReviewerCapabilities` for future opt-out.
- `mcp-server/src/adapters/codex.ts` — add `runConsult` (delegates to existing `runCli`).
- `mcp-server/src/adapters/gemini.ts` — same.
- `mcp-server/src/adapters/claude.ts` — same.
- `mcp-server/src/index.ts` — register `multi_consult` tool, route in handler switch.
- `mcp-server/src/commands.ts` — install `multi-consult.md` to `~/.claude/commands/`.
- `mcp-server/src/tools/feedback.ts` — sharpen `multi_review`'s tool description to anchor on input shape (`requires ccOutput`), parallel to `multi_consult`'s description. Reduces tool-routing collision on natural-language asks.
- `README.md` and `mcp-server/README.md` — add `/multi-consult` to the command list.

## Estimated Scope

~280 lines of new code, ~70 lines modified. One new prompt template (~50 lines), three adapter additions of ~10 lines each (delegating to existing `runCli`), one new MCP handler (simpler than `handleMultiReview` — no adversarial pass), validation helper (~20 lines), and tests (~120 lines). No schema changes to existing review surface, no pipeline changes.

## Implementation Approach (Architectural Choice)

Considered three options:

1. **Reuse review pipeline with a `mode` flag** — overload `ReviewRequest`, branch in adapters. Smallest diff but pollutes review types with consult-only concerns.
2. **Parallel adapter method `runConsult` *with mandated shared private CLI runner* (chosen)** — new `ConsultRequest` type, new required method on `ReviewerAdapter`, but `runConsult` and `runReview` both delegate to each adapter's existing private `runCli`. Clean public separation; no spawn-path duplication.
3. **Generic public `runPrompt`** — refactor adapters to a single primitive, build both `runReview` and `runConsult` on top. More elegant long-term, biggest refactor now.

(2) was chosen because the public semantics genuinely diverge (no `outputType`, different prompt template, different post-processing), but the *private* spawn path is identical and must not be duplicated. The mandated shared `runCli` delegation closes the duplication concern that would otherwise undermine option (2). (1) couples the public surfaces and makes both noisier; (3) is over-engineering for two use cases. If a third panel-style command appears later (`/multi-explain`, peer-review), revisit option (3).

## Revisions

This spec was reviewed via `/multi-review` and revised. Notable changes from initial draft:

- `runConsult` is required (not optional). Optional method created silent-feature-drop risk.
- Mandated shared private CLI runner (existing `runCli`) — pins option (2) so it doesn't degenerate into 50-line per-adapter copy-paste.
- Added `relevantFiles?: string[]` for code-grounded questions to bound filesystem trawling.
- Output flow: synthesis primary, plus mandatory one-line "Models said:" provenance footer (vs. original synthesis-only). Audit trail without dumping.
- Pinned `$ARGUMENTS` parsing rule explicitly: bracketed reserved tokens, otherwise treat `$ARGUMENTS` as the literal question.
- Added `validateConsultSections` post-hoc regex check; CC sees `⚠️ Format drift` markers when models break the 5-section structure.
- Sharpened Tradeoffs vs Risks distinction in prompt; added READ-ONLY preamble; wrapped `customPrompt` in `<user-steering>` envelope with explicit format precedence.
- All-failed fallback: ASK the user, do not silently substitute CC's own answer.
- Use `Promise.allSettled` (not `Promise.all`).
- Tool descriptions for both `multi_review` and `multi_consult` anchor on input shape, not slash-command literal. Reduces routing collision.
- Explicit Codex `xhigh` default test mandated (not implicit via config fallback).
