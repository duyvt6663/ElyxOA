## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Project Rules

- Read `docs/context/index.md` at the start of every session to understand the project.
- Update `docs/context/index.md` after large code or document updates, and keep it concise.

## 5. Concurrent, Multi-Party Work

**Multiple people and AI agents edit this SAME working tree at the same time. Never assume a
change you didn't make is junk.**

At any moment the tree may contain in-progress, untracked, uncommitted work belonging to a
teammate (a new backlog doc, a new component, scratch files). That a file is "unexpected",
outside your task's scope, or untracked is NOT evidence it's safe to remove — it is far more
likely someone else's live work.

- **Touch only the files your current task owns.** Leave everything else exactly as found,
  even if it looks stray or half-finished.
- **Never delete or revert what you did not create.** No `rm`, `git clean`, `git checkout --`,
  `git restore`, or `git reset --hard` on files/paths you didn't author. Untracked files are
  unrecoverable from git. If something looks wrong, STOP and ask the human — don't "fix" it.
- **Stage narrowly.** When committing, `git add` only your task's specific files (never `git add
  -A`/`.`), so you never sweep a teammate's concurrent changes into your commit.
- A PreToolUse guard (`.claude/hooks/block-dangerous-commands.mjs`, wired in
  `.claude/settings.json`) blocks the destructive commands above. It's a backstop, not a
  substitute for the judgment above. If it blocks you, that's the signal to ask a human — not
  to find a way around it.
