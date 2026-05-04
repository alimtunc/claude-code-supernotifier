#!/usr/bin/env node
// Release helper. Auto-detects bump kind from conventional commits since the
// last v*.*.* tag, runs the full verification pipeline, bumps package.json,
// updates CHANGELOG, then commits and tags. Optionally pushes to trigger the
// release workflow.
//
// Usage:
//   pnpm release [patch|minor|major] [--dry-run] [--yes] [--push]
//
// Flags:
//   --dry-run   Print the plan and exit without touching anything.
//   --yes       Skip the interactive confirmation before committing.
//   --push      After tagging, prompt to push origin main + tag (or skip the
//               prompt with --yes). Triggers .github/workflows/release.yml.
//
// CHANGELOG strategy: if a `## [Unreleased]` block exists, it is renamed to
// `## [X.Y.Z] - DATE`. Otherwise a stub is generated from commit subjects —
// review it and amend before pushing.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

type BumpKind = 'major' | 'minor' | 'patch';

interface Commit {
  hash: string;
  shortHash: string;
  type: string;
  scope: string | null;
  breaking: boolean;
  subject: string;
}

interface Args {
  forced: BumpKind | null;
  dryRun: boolean;
  yes: boolean;
  push: boolean;
}

const COMMIT_HEADER_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function capture(cmd: string, args: readonly string[]): string {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${result.status})\n${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function inherit(cmd: string, args: readonly string[]): void {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) fail(`${cmd} ${args.join(' ')} exited with ${result.status}`);
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function parseArgs(argv: readonly string[]): Args {
  const valid: readonly BumpKind[] = ['patch', 'minor', 'major'];
  let forced: BumpKind | null = null;
  let dryRun = false;
  let yes = false;
  let push = false;
  for (const a of argv) {
    if (a === '--') continue;
    if (a === '--dry-run') dryRun = true;
    else if (a === '--yes' || a === '-y') yes = true;
    else if (a === '--push') push = true;
    else if (valid.includes(a as BumpKind)) {
      if (forced !== null) fail('Bump kind specified twice.');
      forced = a as BumpKind;
    } else {
      fail(`Unknown argument "${a}". Usage: pnpm release [patch|minor|major] [--dry-run] [--yes] [--push]`);
    }
  }
  return { forced, dryRun, yes, push };
}

function ensureCleanTree(): void {
  const status = capture('git', ['status', '--porcelain']);
  if (status) fail(`Working tree not clean. Commit or stash first:\n${status}`);
}

function currentBranch(): string {
  return capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
}

function lastTag(): string | null {
  try {
    return capture('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*.*.*']);
  } catch {
    return null;
  }
}

function commitsSince(tag: string | null): Commit[] {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const log = capture('git', ['log', range, '--format=%H%x09%h%x09%s%x09%b%x00']);
  if (!log) return [];
  const out: Commit[] = [];
  for (const entry of log.split('\0')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [hash, shortHash, subject, body] = trimmed.split('\t');
    if (!hash || !shortHash || !subject) continue;
    const m = COMMIT_HEADER_RE.exec(subject);
    if (!m) {
      out.push({ hash, shortHash, type: 'other', scope: null, breaking: false, subject });
      continue;
    }
    out.push({
      hash,
      shortHash,
      type: m[1] ?? '',
      scope: m[2] ?? null,
      breaking: !!m[3] || /BREAKING CHANGE/i.test(body ?? ''),
      subject: m[4] ?? ''
    });
  }
  return out;
}

function detectBump(commits: readonly Commit[]): BumpKind {
  if (commits.some((c) => c.breaking)) return 'major';
  if (commits.some((c) => c.type === 'feat')) return 'minor';
  return 'patch';
}

function bumpSemver(version: string, kind: BumpKind): string {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    fail(`Invalid current version: ${version}`);
  }
  const [maj, min, pat] = parts as [number, number, number];
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function categorize(commits: readonly Commit[]): Record<string, string[]> {
  const sections: Record<string, string[]> = { Added: [], Changed: [], Fixed: [] };
  for (const c of commits) {
    const line = c.scope ? `${c.scope}: ${c.subject}` : c.subject;
    if (c.type === 'feat') sections.Added!.push(line);
    else if (c.type === 'fix') sections.Fixed!.push(line);
    else if (c.type === 'refactor' || c.type === 'perf' || c.type === 'chore') sections.Changed!.push(line);
  }
  return sections;
}

function buildStubBlock(version: string, sections: Record<string, string[]>): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [`## [${version}] - ${date}`, ''];
  for (const [key, items] of Object.entries(sections)) {
    if (items.length === 0) continue;
    lines.push(`### ${key}`, '');
    for (const item of items) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines.join('\n');
}

type ChangelogPlan = { kind: 'rename-unreleased' } | { kind: 'stub'; block: string };

function planChangelog(version: string, commits: readonly Commit[]): ChangelogPlan {
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  if (/^## \[Unreleased\][^\n]*\n/m.test(content)) {
    return { kind: 'rename-unreleased' };
  }
  return { kind: 'stub', block: buildStubBlock(version, categorize(commits)) };
}

function applyChangelogPlan(version: string, plan: ChangelogPlan): void {
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const date = new Date().toISOString().slice(0, 10);

  if (plan.kind === 'rename-unreleased') {
    const updated = content.replace(/^## \[Unreleased\][^\n]*\n/m, `## [${version}] - ${date}\n`);
    fs.writeFileSync(CHANGELOG_PATH, updated);
    return;
  }

  const insertion = content.match(/^## \[/m);
  if (!insertion || insertion.index === undefined) {
    fs.writeFileSync(CHANGELOG_PATH, `${content}\n${plan.block}`);
    return;
  }
  fs.writeFileSync(
    CHANGELOG_PATH,
    `${content.slice(0, insertion.index)}${plan.block}\n${content.slice(insertion.index)}`
  );
}

function bumpPackageJson(version: string): void {
  const text = fs.readFileSync(PKG_PATH, 'utf8');
  const updated = text.replace(/^(\s*"version":\s*")[^"]+(",?)/m, `$1${version}$2`);
  if (updated === text) fail('Could not locate top-level "version" field in package.json.');
  fs.writeFileSync(PKG_PATH, updated);
}

function tagExists(tag: string): boolean {
  try {
    capture('git', ['rev-parse', '--verify', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function printPreview(opts: {
  currentVersion: string;
  nextVersion: string;
  nextTag: string;
  kind: BumpKind;
  forced: boolean;
  previousTag: string | null;
  branch: string;
  commits: readonly Commit[];
  changelogPlan: ChangelogPlan;
}): void {
  const { currentVersion, nextVersion, nextTag, kind, forced, previousTag, branch, commits, changelogPlan } =
    opts;
  console.log('─── release plan ───────────────────────────────────────');
  console.log(`Branch:            ${branch}`);
  console.log(`Previous tag:      ${previousTag ?? '(none)'}`);
  console.log(`Current version:   ${currentVersion}`);
  console.log(`Next version:      ${nextVersion}  (${kind}${forced ? ', forced' : ', auto'})`);
  console.log(`Next tag:          ${nextTag}`);
  console.log(`Commits in range:  ${commits.length}`);
  if (commits.length > 0) {
    console.log('');
    for (const c of commits) {
      const flag = c.breaking ? '!' : ' ';
      const scope = c.scope ? `(${c.scope})` : '';
      console.log(`  ${flag} ${c.shortHash} ${c.type}${scope}: ${c.subject}`);
    }
  }
  console.log('');
  if (changelogPlan.kind === 'rename-unreleased') {
    console.log('CHANGELOG: existing [Unreleased] block will be renamed.');
  } else if (
    changelogPlan.block.trim() === `## [${nextVersion}] - ${new Date().toISOString().slice(0, 10)}`
  ) {
    console.log('CHANGELOG: stub will be inserted (no categorisable commits — empty block).');
  } else {
    console.log('CHANGELOG: stub will be inserted —');
    console.log(
      changelogPlan.block
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n')
    );
  }
  console.log('────────────────────────────────────────────────────────');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dryRun) {
    ensureCleanTree();
  }

  const branch = currentBranch();
  const previousTag = lastTag();
  const commits = commitsSince(previousTag);
  if (commits.length === 0 && args.forced === null) {
    fail(
      `No commits since ${previousTag ?? 'beginning'}. Force a bump with: pnpm release patch | minor | major.`
    );
  }

  const kind = args.forced ?? detectBump(commits);
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')) as { version?: string };
  if (typeof pkg.version !== 'string') fail('package.json has no string "version" field.');
  const nextVersion = bumpSemver(pkg.version, kind);
  const nextTag = `v${nextVersion}`;

  if (tagExists(nextTag)) fail(`Tag ${nextTag} already exists.`);

  const changelogPlan = planChangelog(nextVersion, commits);

  printPreview({
    currentVersion: pkg.version,
    nextVersion,
    nextTag,
    kind,
    forced: args.forced !== null,
    previousTag,
    branch,
    commits,
    changelogPlan
  });

  if (args.dryRun) {
    console.log('\n--dry-run: nothing was modified.');
    return;
  }

  if (branch !== 'main' && !args.yes) {
    const ok = await confirm(`You're on branch "${branch}", not main. Proceed anyway?`);
    if (!ok) fail('Aborted.');
  }

  if (!args.yes) {
    const ok = await confirm(`Bump ${pkg.version} → ${nextVersion} and tag ${nextTag}?`);
    if (!ok) fail('Aborted.');
  }

  console.log('\nRunning verification pipeline...');
  inherit('pnpm', ['run', 'lint']);
  inherit('pnpm', ['run', 'format:check']);
  inherit('pnpm', ['run', 'typecheck']);
  inherit('pnpm', ['test']);
  inherit('node', ['esbuild.js', '--production']);

  bumpPackageJson(nextVersion);
  applyChangelogPlan(nextVersion, changelogPlan);

  capture('git', ['add', 'package.json', 'CHANGELOG.md']);
  capture('git', ['commit', '-m', `chore(release): ${nextTag}`]);
  capture('git', ['tag', nextTag]);

  console.log(`\n✓ Committed and tagged ${nextTag}.`);
  if (changelogPlan.kind === 'stub') {
    console.log('  CHANGELOG entry was auto-generated — review it.');
    console.log(`  To revise: edit CHANGELOG.md, then \`git commit --amend && git tag -f ${nextTag}\``);
  }

  if (!args.push) {
    console.log(`\nNext: git push origin ${branch} ${nextTag}`);
    console.log('(triggers .github/workflows/release.yml → marketplace publish if VSCE_PAT is set)');
    return;
  }

  if (!args.yes) {
    const ok = await confirm(`Push origin ${branch} and ${nextTag} now?`);
    if (!ok) {
      console.log(`\nSkipped push. Run later: git push origin ${branch} ${nextTag}`);
      return;
    }
  }

  console.log('\nPushing...');
  inherit('git', ['push', 'origin', branch]);
  inherit('git', ['push', 'origin', nextTag]);
  console.log(
    `\n✓ Pushed. Watch the release workflow: gh run watch -R ${capture('git', ['config', '--get', 'remote.origin.url'])}`
  );
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
