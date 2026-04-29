# Multi Review

Get parallel standard AND adversarial reviews from all available models (Codex, Gemini, Claude Opus).

Each model runs twice: once as a standard reviewer (finding bugs, issues, improvements) and once as an adversarial challenger (breaking confidence in the change, questioning assumptions, targeting hidden failure paths). Results are presented in two sections.

Use `$ARGUMENTS` to steer the adversarial focus (e.g., "focus the challenge on race conditions and rollback safety").

## Arguments
- `$ARGUMENTS` - Optional: focus area, custom instructions, or adversarial steering

## When to Use

Use `/multi-review` when you want thorough parallel reviews from all available models. Every invocation includes both standard and adversarial passes.

## Examples

```
/multi-review
/multi-review focus the challenge on race conditions and rollback safety
/multi-review challenge whether this was the right caching and retry design
```

## Before Calling - PREPARE THE HANDOFF

### 1. Summarize What You Did + State the Acceptance Bar

Don't just say what you did — also state the bar the work needs to clear. The bar is what lets reviewers calibrate "material" vs "nice to have." Without it, reviewers default to general code-quality vibes, which produces drift across runs.

```
"Implemented caching layer for the product catalog API using Redis with cache invalidation on product updates.
Bar: safe under concurrent updates (no stale reads on the next request) AND p95 read latency under 50ms."
```

### 2. List Your Uncertainties — Tag Load-Bearing vs Incidental

Tag each uncertainty:
- `[load-bearing]` = if your assumption here is wrong, the work is NOT shipping-ready
- `[incidental]` = nice to verify but won't block ship

Reviewers prioritize accordingly, and your synthesis can elevate `[load-bearing]` items above stylistic findings.

```
UNCERTAINTIES:
- [load-bearing] "Is the cache invalidation race-free under concurrent updates?"
- [incidental] "Is the TTL value optimal — could it be 60s instead of 30s?"
```

### 3. Ask Specific Questions
```
QUESTIONS:
- "Should I use write-through or write-behind caching?"
- "Is there a race condition in the invalidation logic?"
```

### 4. Identify Decisions You Made

If you chose between alternatives — caching strategy, retry policy, error-handling shape, schema design, etc. — list them with rationale. The handoff schema's `decisions[]` field gives the adversarial reviewer a concrete hook to attack the design choice rather than just hunt for bugs. Skip if the change is a straightforward bug fix with no design choice involved.

```
DECISIONS:
1. Chose write-through cache over write-behind. Rationale: stronger read-after-write consistency at the cost of slightly slower writes; we prioritize correctness for catalog data.
2. Chose 30s TTL with explicit invalidation on update. Rationale: TTL bounds staleness if invalidation misses; explicit invalidation catches the common path immediately.
```

## Tool Invocation

Call `multi_review` with:

```json
{
  "workingDir": "<current directory>",
  "ccOutput": "<structured handoff>",
  "outputType": "analysis",
  "focusAreas": ["<from $ARGUMENTS>"],
  "customPrompt": "<steering text from $ARGUMENTS for adversarial focus>"
}
```

### Service Tier (from $ARGUMENTS, applies to Codex only)
- If user says "flex", "cheap", or "budget" → set `serviceTier: "flex"`
- If user says "default tier" or "standard tier" → set `serviceTier: "default"`
- Otherwise → omit `serviceTier` (defaults to `"fast"` — priority processing, ~2x cost)

### Structure your ccOutput:

```
SUMMARY:
<what you did, 1-3 sentences>
Bar: <what counts as shipping-ready — concrete acceptance criteria>

UNCERTAINTIES (verify these):
1. [load-bearing|incidental] <uncertainty>
2. [load-bearing|incidental] <uncertainty>

QUESTIONS:
1. <question>

DECISIONS:
1. <choice>. Rationale: <why this over alternatives>
2. <choice>. Rationale: <why this over alternatives>

PRIORITY FILES:
- <file>
```

## After Receiving Review

You will receive two sections: **Standard Review Findings** and **Challenge Review Findings**.

### Synthesize

1. **Standard findings** — bugs, issues, improvements from each model
   - Find agreements across models (higher confidence)
   - Identify conflicts (YOU decide who's right)

2. **Challenge findings** — adversarial challenges from each model
   - These target assumptions and design decisions, not just bugs
   - Evaluate on merit — some challenges are speculative by design
   - Strong challenges with evidence deserve serious consideration

3. **Cross-reference** standard vs challenge findings
   - Standard + challenge agreement = high confidence issue
   - Challenge-only finding = investigate further before acting

4. **Verify all findings**
   - Check file/line references exist
   - Read actual code
   - Mark your confidence:
     - ✓✓ Verified
     - ✓ Plausible
     - ? Investigate
     - ✗ Rejected

5. **Make YOUR recommendation**
   - Don't just relay findings
   - Apply your judgment

$ARGUMENTS
