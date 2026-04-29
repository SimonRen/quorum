# Multi Consult

Ask Codex, Gemini, and Claude (Opus, fresh context) the same question in parallel and synthesize their answers. Use this for **consultation** — finding the best approach, weighing alternatives, getting a panel's take. NOT for reviewing work CC has already done (use `/multi-review` for that).

## Arguments
- `$ARGUMENTS` — the question itself, optional steering, or both

## When to Use

Use `/multi-consult` when you have a question or problem and want a synthesized panel opinion. The panel responds in a fixed 5-section structure (Recommendation / Reasoning / Tradeoffs / Risks / Open questions). CC reads all three responses and presents one consolidated answer with a "Models said:" provenance footer.

## Examples

```
/multi-consult Should we use Postgres or DynamoDB for a write-heavy timeseries workload?
/multi-consult How should I refactor the auth middleware? Focus on rollback safety.
/multi-consult What's the cleanest way to memoize this expensive selector? [flex]
```

## Before Calling - PREPARE THE HANDOFF

### 1. Pre-compose the question

**`$ARGUMENTS` parsing rule (pinned):**

- **If conversation context already contains the question CC has been working on:** compose `question` from that context. `$ARGUMENTS` is treated as pure steering — extract reserved tokens (see below) into schema fields; remainder goes into `customPrompt`.
- **Otherwise — `$ARGUMENTS` IS the literal question.** Set `customPrompt` to empty. Reserved tokens are extracted *only* when they appear at the *end* of `$ARGUMENTS` inside brackets or parens — e.g., `... [flex]`, `... (high reasoning)`. A bare occurrence of `flex` / `cheap` / `default tier` inside the prose is treated as part of the question, NOT a flag, to avoid corrupting questions like *"Should we offer a flex tier or default tier for customers?"*.

### 2. Triage code-grounded questions

If the question references the codebase, populate `relevantFiles` with the minimal subset (3-10 files typically) the panel needs. For purely general questions ("Postgres vs Mongo for X workload?"), omit `relevantFiles` — the panel will answer from expertise without trawling the filesystem.

### 3. Refuse sensitive working directories

If the current working directory is `/etc`, `~`, `~/.ssh`, or any other clearly sensitive system path, **refuse**. Tell the user: "Please invoke `/multi-consult` from a project root — `<cwd>` looks sensitive." Do not call the tool.

### 4. Extract criteria; clarify load-bearing assumptions BEFORE calling

Pin what the question is being judged against. Once criteria are explicit, the panel's recommendation is anchored to them instead of floating — this is the fix for "ask twice, get a different answer." Stochastic re-runs converge much better against fixed criteria than against an under-specified question.

**4a. Append a CRITERIA block to the end of `question`**, priority-ordered, each tagged `[stated]` or `[assumed]`:

```
CRITERIA (priority order):
1. [stated] cost-per-request under $X / 1M ops
2. [stated] team writes Go; minimize ops complexity
3. [assumed] sustained ~10k QPS write rate
4. [assumed] eventual consistency acceptable for analytics
```

- `[stated]` = explicit in the user's message or earlier conversation.
- `[assumed]` = you needed to fix it to recommend; the user did NOT say.
- Cap `[assumed]` at 3. If the top 3 don't fit, the question is too vague — bounce back to the user before calling.

**4b. Pre-call clarification gate.** Scan your `[assumed]` criteria. If any is **load-bearing** (the recommendation would flip if the assumption is wrong), STOP and ask the user before invoking the tool:

> "Before I consult the panel, I need to confirm: <restate assumption>. Is that right, or should I adjust to <plausible alternative>?"

A burned panel call on a wrong assumed criterion costs more than the round-trip.

**Skip the gate when:**
- `[stated]` criteria fully pin the answer space (no assumptions needed).
- The user told you to proceed without clarification.
- Remaining assumptions are clearly incidental (would not flip the rec).

## Tool Invocation

Call `multi_consult` with:

```json
{
  "workingDir": "<current directory>",
  "question": "<CC-composed question OR literal $ARGUMENTS minus end-bracket reserved tokens>",
  "relevantFiles": ["<file1>", "<file2>"],
  "customPrompt": "<steering text or empty>"
}
```

### Reserved-token mappings (only when bracketed at end of $ARGUMENTS)

- `[flex]` / `[cheap]` / `[budget]` → `serviceTier: "flex"`
- `[default tier]` / `[standard tier]` → `serviceTier: "default"`
- `[high reasoning]` → `reasoningEffort: "high"` (overrides default `xhigh`)

If the user types one of these mid-question (not in brackets), leave it in the question.

## After Receiving the Panel

You will receive each model's structured 5-section response. Some may carry a `⚠️ Format drift: missing sections [...]` marker — degrade synthesis confidence accordingly for that model.

### Synthesize

1. **Cross-compare Recommendations.** Agreement across all three → high confidence. 2-vs-1 split → take a side and *surface the dissent explicitly* in your answer (don't flatten it). All three disagree → present the tradeoff space honestly and pick.
2. **Mine Tradeoffs and Risks.** Even when models agree on the recommendation, the *reasons* and *risks* often diverge — surface the union, not just the intersection. If a single model raised a Risk the others missed, surface it as "1 model raised: …" — *do not silently drop it.*
3. **Forward Open questions** to the user only if material — do not dump every "what's your scale?" clarifier.
4. **Apply your own judgment.** You have full conversation context the panel does not; you may dismiss panel suggestions that miss the user's actual constraint, but say so explicitly when overriding.
5. **Respond with one consolidated answer**, structured as: **Recommendation** (what to do) → **Why** (synthesis of reasoning) → **Watch out for** (consolidated risks, including any single-model-only risks) → optional **Open question for you** if a real ambiguity blocks the answer.
6. **Append a "Models said:" provenance footer** — a single line per model with the recommendation in <80 chars. Example:

   ```
   ---
   **Models said:**  Codex → Postgres + read replicas.  Gemini → Postgres + Citus.  Claude → DynamoDB w/ caveat on cost at scale.
   ```

   This is **non-negotiable**. The footer is the audit trail; without it, synthesis-only is opaque.
7. **Do NOT paste full raw model outputs to the user** unless they explicitly ask ("show me what each model said", "raw").
8. **All-failed special case:** if the header is `❌ All Failed`, surface the failure types and **ASK** the user *"Panel unavailable — want my solo answer instead?"*. **Do NOT silently substitute** your own answer for the panel's.

$ARGUMENTS
