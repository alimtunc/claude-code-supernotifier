#!/usr/bin/env node
// Release helper. Auto-detects bump kind from conventional commits since the
// last v*.*.* tag (override with `pnpm release patch|minor|major`), runs the
// full verification pipeline, bumps package.json, updates CHANGELOG, then
// commits and tags. Never pushes — the user runs `git push origin main vX.Y.Z`
// once they're satisfied with the release commit.
//
// CHANGELOG strategy: if a `## [Unreleased]` block exists, it is renamed to
// `## [X.Y.Z] - DATE`. Otherwise a stub is generated from commit subjects.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

type BumpKind = 'major' | 'minor' | 'patch';

interface Commit {
  hash: string;
  type: string;
  scope: string | null;
  breaking: boolean;
  subject: string;
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

function ensureCleanTree(): void {
  const status = capture('git', ['status', '--porcelain']);
  if (status) fail(`Working tree not clean. Commit or stash first:\n${status}`);
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
  const log = capture('git', ['log', range, '--format=%H%x09%s%x09%b%x00']);
  if (!log) return [];
  const out: Commit[] = [];
  for (const entry of log.split('\0')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [hash, subject, body] = trimmed.split('\t');
    if (!hash || !subject) continue;
    const m = COMMIT_HEADER_RE.exec(subject);
    if (!m) continue;
    out.push({
      hash,
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

function updateChangelog(version: string, commits: readonly Commit[]): { fromUnreleased: boolean } {
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const date = new Date().toISOString().slice(0, 10);

  const unreleasedRe = /^## \[Unreleased\][^\n]*\n/m;
  if (unreleasedRe.test(content)) {
    fs.writeFileSync(CHANGELOG_PATH, content.replace(unreleasedRe, `## [${version}] - ${date}\n`));
    return { fromUnreleased: true };
  }

  const stub = buildStubBlock(version, categorize(commits));
  const insertion = content.match(/^## \[/m);
  if (!insertion || insertion.index === undefined) {
    fs.writeFileSync(CHANGELOG_PATH, `${content}\n${stub}`);
    return { fromUnreleased: false };
  }
  const before = content.slice(0, insertion.index);
  const after = content.slice(insertion.index);
  fs.writeFileSync(CHANGELOG_PATH, `${before}${stub}\n${after}`);
  return { fromUnreleased: false };
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

function main(): void {
  const arg = process.argv[2];
  const valid: readonly BumpKind[] = ['patch', 'minor', 'major'];
  let forced: BumpKind | null = null;
  if (arg !== undefined) {
    if (!valid.includes(arg as BumpKind)) {
      fail(`Unknown bump "${arg}". Use: patch | minor | major (or omit for auto-detect).`);
    }
    forced = arg as BumpKind;
  }

  ensureCleanTree();

  const previousTag = lastTag();
  const commits = commitsSince(previousTag);
  if (commits.length === 0 && forced === null) {
    fail(`No commits since ${previousTag ?? 'beginning'}. Force with: pnpm release patch | minor | major.`);
  }

  const kind = forced ?? detectBump(commits);
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')) as { version?: string };
  if (typeof pkg.version !== 'string') fail('package.json has no string "version" field.');
  const nextVersion = bumpSemver(pkg.version, kind);
  const nextTag = `v${nextVersion}`;

  if (tagExists(nextTag)) fail(`Tag ${nextTag} already exists.`);

  console.log(`Bumping ${pkg.version} → ${nextVersion} (${kind}${forced ? ', forced' : ''})`);
  console.log(`${commits.length} commit(s) since ${previousTag ?? 'beginning'}`);

  console.log('\nRunning verification pipeline...');
  inherit('pnpm', ['run', 'lint']);
  inherit('pnpm', ['run', 'format:check']);
  inherit('pnpm', ['run', 'typecheck']);
  inherit('pnpm', ['test']);
  inherit('node', ['esbuild.js', '--production']);

  bumpPackageJson(nextVersion);
  const { fromUnreleased } = updateChangelog(nextVersion, commits);

  capture('git', ['add', 'package.json', 'CHANGELOG.md']);
  capture('git', ['commit', '-m', `chore(release): ${nextTag}`]);
  capture('git', ['tag', nextTag]);

  console.log(`\n✓ Committed and tagged ${nextTag}.`);
  if (!fromUnreleased) {
    console.log('  CHANGELOG entry was auto-generated from commit subjects — review it.');
    console.log(`  To revise: edit CHANGELOG.md, then \`git commit --amend && git tag -f ${nextTag}\``);
  }
  console.log(`\nNext: git push origin main ${nextTag}`);
  console.log('(triggers .github/workflows/release.yml → marketplace publish if VSCE_PAT is set)');
}

try {
  main();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
