#!/usr/bin/env node
/**
 * PreToolUse guard — blocks destructive shell commands before they run.
 *
 * WHY THIS EXISTS
 * ---------------
 * This repository is worked on by MULTIPLE PARTIES AT THE SAME TIME — several humans
 * and/or AI agents editing the SAME working tree concurrently. That means at any moment
 * the tree can contain in-progress, UNTRACKED, UNCOMMITTED work that belongs to someone
 * else (a half-written backlog doc, a new component, scratch files). An agent that sees
 * an "unexpected" file or a change it didn't make MUST NOT assume it is junk and delete
 * it — it is far more likely a teammate's live work.
 *
 * A real incident motivated this hook: an agent saw an untracked `docs/backlog/020-*.md`
 * plus an edit to `index.md` that were outside its assigned scope, assumed an agent had
 * overstepped, and ran `rm` + `git checkout` to "revert" them. They were a teammate's
 * concurrent work, and the untracked file was unrecoverable from git.
 *
 * This hook makes that class of mistake impossible to commit silently: the dangerous
 * command is DENIED before execution, and the agent is told to stop and confirm with a
 * human instead of guessing.
 *
 * MECHANISM
 * ---------
 * Registered as a PreToolUse hook on the Bash tool (see .claude/settings.json). It runs
 * BEFORE the command executes (a PostToolUse hook could not prevent anything — the damage
 * would already be done). It reads the hook payload as JSON on stdin, inspects the bash
 * command, and:
 *   - exit 0  → allow the command (no output).
 *   - exit 2  → BLOCK the command; the stderr text is shown to the agent as the reason.
 *
 * It fails OPEN (exit 0) on any internal error, so a bug here can never brick the Bash
 * tool for everyone — it only ever ADDS protection, never removes the ability to work.
 *
 * SCOPE — what is blocked (irreversible / clobbers concurrent work):
 *   rm / rmdir, git clean, git reset --hard, git checkout -- <path> / git checkout .,
 *   git restore, git stash drop|clear, find ... -delete.
 * Non-destructive git/file commands are untouched.
 *
 * OVERRIDE — if a destructive command is genuinely needed, a HUMAN should run it directly
 * (e.g. type `! rm /tmp/scratch` in the Claude Code prompt), or temporarily edit/remove
 * this hook. The agent is intentionally NOT given a self-serve bypass token: the friction
 * is the point.
 */

// Every pattern is anchored to a COMMAND POSITION — the start of the line or right after a
// shell separator (`;` `&&` `||` `|` `(`), with an optional leading `sudo`. This is what makes
// `git commit -m "remove rm calls"` SAFE (the `rm` there is an argument inside a quoted string,
// not at a command position) while `echo done && rm -rf x` and `find . | xargs rm` are caught.
const CMD = String.raw`(?:^|\n|[;&|(])\s*(?:sudo\s+)?`;
const mk = (body, label) => ({ re: new RegExp(CMD + body), label });

const DANGEROUS = [
  // rm / rmdir / unlink, including absolute paths like /bin/rm.
  mk(String.raw`(?:/\S+/)?(?:rm(?:dir)?|unlink)\b`, 'rm / rmdir / unlink (irreversible delete)'),
  // git clean removes UNTRACKED files — exactly how a teammate's new files vanish for good.
  mk(String.raw`git\s+clean\b`, 'git clean (deletes untracked files — likely a teammate’s new work)'),
  // git reset --hard discards uncommitted changes across the tree.
  mk(String.raw`git\s+reset\b[^\n]*--hard\b`, 'git reset --hard (discards uncommitted changes)'),
  // git checkout -- <path> or git checkout . discards uncommitted edits to those paths.
  mk(String.raw`git\s+checkout\b[^\n]*(?:\s--\s|\s--$|\s\.(?:\s|$))`, 'git checkout -- <path> / git checkout . (discards uncommitted edits)'),
  // git restore (modern form of the above).
  mk(String.raw`git\s+restore\b`, 'git restore (discards uncommitted edits)'),
  // git stash drop/clear destroys stashed work.
  mk(String.raw`git\s+stash\s+(?:drop|clear)\b`, 'git stash drop/clear (destroys stashed work)'),
  // Piped/bulk deletes: `xargs rm` and `find ... -delete`.
  mk(String.raw`xargs\b[^\n]*\brm\b`, 'xargs rm (bulk delete)'),
  mk(String.raw`find\b[^\n]*-delete\b`, 'find ... -delete (bulk irreversible delete)'),
];

async function readStdin() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

try {
  const raw = await readStdin();
  const payload = JSON.parse(raw || '{}');

  // Only inspect Bash; anything else is allowed straight through.
  if (payload.tool_name !== 'Bash') process.exit(0);

  const command = (payload.tool_input && payload.tool_input.command) || '';
  const hit = DANGEROUS.find((d) => d.re.test(command));
  if (!hit) process.exit(0);

  const reason =
    `BLOCKED by .claude/hooks/block-dangerous-commands.mjs — this command matched a ` +
    `destructive pattern: ${hit.label}.\n\n` +
    `Multiple people/agents are editing this working tree at the same time, so an ` +
    `"unexpected" file or change is probably a teammate's live, possibly UNTRACKED work — ` +
    `not junk to clean up. Do NOT delete or revert what you did not create.\n\n` +
    `If this deletion/revert is genuinely required, STOP and ask the human to run it ` +
    `themselves (e.g. \`! ${command.length > 80 ? command.slice(0, 80) + '…' : command}\`), ` +
    `or have them adjust this hook. Otherwise choose a non-destructive path.`;

  process.stderr.write(reason + '\n');
  process.exit(2); // exit 2 = block the tool call, show stderr to the agent.
} catch {
  // Fail OPEN: never let a bug in this guard block legitimate work for everyone.
  process.exit(0);
}
