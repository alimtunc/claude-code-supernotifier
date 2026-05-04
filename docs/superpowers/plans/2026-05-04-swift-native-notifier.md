# Swift-Native macOS Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dependency on the third-party `terminal-notifier` CLI with a self-contained Swift binary bundled inside `ClaudeCodeSupernotifier.app`, so macOS notifications appear under our identity (icon = octopus, sender name = "Claude Code SuperNotifier") on Sonoma/Sequoia.

**Architecture:** Ship a tiny Swift CLI compiled as a universal (arm64 + x86_64) binary inside our `.app`. The Swift binary uses the modern `UNUserNotificationCenter` API. Because it runs from inside our `.app`, macOS attributes notifications to our `CFBundleIdentifier`. The hook (Node) spawns this binary instead of `terminal-notifier`. Click handling is done in-process by the Swift binary (waits up to N seconds for the click event), which writes to the existing signal-file mechanism and optionally launches the editor — keeping the existing `clickSignals.ts` watcher intact.

**Tech Stack:**
- Swift 5+ (`swiftc` from Xcode CLI tools), frameworks `UserNotifications` + `AppKit`
- `lipo` for universal binary, `codesign -s -` for ad-hoc signature
- Existing TS toolchain (esbuild, vitest, oxlint, oxfmt)
- Removed: `terminal-notifier` (Homebrew), all `-sender` plumbing, `senderBundleId` setting

---

## Pre-Flight

### Task 0: Worktree + branch

**Files:**
- New worktree at `../claude-code-supernotifier-swift-notifier`
- New branch `swift-native-notifier`

- [ ] **Step 1: Verify the working tree is clean and on `main`**

Run:
```bash
git status
git branch --show-current
```
Expected: `main`, no uncommitted changes other than the in-progress octopus-icon work (those should be committed first or stashed before starting this plan).

- [ ] **Step 2: Create the worktree**

Run from the main repo:
```bash
git worktree add -b swift-native-notifier ../claude-code-supernotifier-swift-notifier main
cd ../claude-code-supernotifier-swift-notifier
pnpm install
```
Expected: worktree created, deps installed.

- [ ] **Step 3: Sanity-check toolchain**

Run:
```bash
xcrun --sdk macosx --find swiftc
xcrun --sdk macosx --find lipo
which codesign
swiftc --version | head -1
```
Expected: all four resolve; `swiftc` reports Swift 5.x or 6.x.

If `swiftc` is missing, install Xcode Command Line Tools: `xcode-select --install`. This plan **requires** them.

---

## Phase 1: Swift Binary

### Task 1: Skeleton — fire one hardcoded notification

**Files:**
- Create: `scripts/notifier-src/main.swift`
- Create: `scripts/notifier-src/.gitignore` (excludes `build/`)

- [ ] **Step 1: Write the minimal Swift source**

Create `scripts/notifier-src/main.swift`:

```swift
import Foundation
import UserNotifications

guard let bundleId = Bundle.main.bundleIdentifier, !bundleId.isEmpty else {
    FileHandle.standardError.write(Data("notifier must be launched from inside its .app bundle\n".utf8))
    exit(2)
}

let center = UNUserNotificationCenter.current()
let authGroup = DispatchGroup()
authGroup.enter()
center.requestAuthorization(options: [.alert, .sound]) { _, _ in
    authGroup.leave()
}
authGroup.wait()

let content = UNMutableNotificationContent()
content.title = "Claude Code SuperNotifier"
content.body = "Skeleton notification — wired up."
content.sound = UNNotificationSound.default

let request = UNNotificationRequest(
    identifier: UUID().uuidString,
    content: content,
    trigger: nil
)

let postGroup = DispatchGroup()
postGroup.enter()
center.add(request) { error in
    if let error = error {
        FileHandle.standardError.write(Data("post failed: \(error)\n".utf8))
    }
    postGroup.leave()
}
postGroup.wait()

// Give the system a tick to actually display the notif before we exit.
Thread.sleep(forTimeInterval: 0.5)
exit(0)
```

- [ ] **Step 2: Add a build-artifact gitignore**

Create `scripts/notifier-src/.gitignore`:
```
build/
```

- [ ] **Step 3: Smoke-compile manually (no bundle yet)**

Run:
```bash
mkdir -p scripts/notifier-src/build
xcrun -sdk macosx swiftc -O \
  -target arm64-apple-macos11 \
  -framework UserNotifications \
  -o scripts/notifier-src/build/notifier-arm64 \
  scripts/notifier-src/main.swift
file scripts/notifier-src/build/notifier-arm64
```
Expected: `Mach-O 64-bit executable arm64`. **Do not run the binary directly** — it will exit with code 2 because it's not inside an .app bundle. That's correct behavior; we'll exercise it from inside the bundle in Task 4.

- [ ] **Step 4: Commit**

```bash
git add scripts/notifier-src/main.swift scripts/notifier-src/.gitignore
git commit -m "feat(notifier): swift skeleton that fires a single notification"
```

---

### Task 2: CLI argument parsing

**Files:**
- Modify: `scripts/notifier-src/main.swift` (replace top of file)

- [ ] **Step 1: Replace main.swift with a version that parses args**

Overwrite `scripts/notifier-src/main.swift`:

```swift
import Foundation
import UserNotifications

struct Args {
    var title: String = "Claude Code SuperNotifier"
    var message: String = ""
    var sound: String? = nil
    var group: String? = nil
    var prime: Bool = false
    var dryRun: Bool = false
}

func parseArgs() -> Args {
    var a = Args()
    var it = CommandLine.arguments.dropFirst().makeIterator()
    while let arg = it.next() {
        switch arg {
        case "--title":   if let v = it.next() { a.title = v }
        case "--message": if let v = it.next() { a.message = v }
        case "--sound":   if let v = it.next() { a.sound = v }
        case "--group":   if let v = it.next() { a.group = v }
        case "--prime":   a.prime = true
        case "--dry-run": a.dryRun = true
        default: break
        }
    }
    return a
}

guard let bundleId = Bundle.main.bundleIdentifier, !bundleId.isEmpty else {
    FileHandle.standardError.write(Data("notifier must be launched from inside its .app bundle\n".utf8))
    exit(2)
}

let args = parseArgs()

if args.dryRun {
    let payload: [String: Any] = [
        "bundleId": bundleId,
        "title": args.title,
        "message": args.message,
        "sound": args.sound as Any,
        "group": args.group as Any,
        "prime": args.prime
    ]
    if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
       let s = String(data: data, encoding: .utf8) {
        print(s)
    }
    exit(0)
}

let center = UNUserNotificationCenter.current()
let authGroup = DispatchGroup()
authGroup.enter()
center.requestAuthorization(options: [.alert, .sound]) { _, _ in authGroup.leave() }
authGroup.wait()

if args.prime { exit(0) }

let content = UNMutableNotificationContent()
content.title = args.title
content.body = args.message
if let s = args.sound, !s.isEmpty {
    content.sound = UNNotificationSound(named: UNNotificationSoundName(s))
}
if let g = args.group, !g.isEmpty {
    content.threadIdentifier = g
}

let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
let postGroup = DispatchGroup()
postGroup.enter()
center.add(request) { _ in postGroup.leave() }
postGroup.wait()

Thread.sleep(forTimeInterval: 0.5)
exit(0)
```

- [ ] **Step 2: Re-compile and verify `--dry-run` works**

Run:
```bash
xcrun -sdk macosx swiftc -O \
  -target arm64-apple-macos11 \
  -framework UserNotifications \
  -o scripts/notifier-src/build/notifier-arm64 \
  scripts/notifier-src/main.swift
```
Expected: clean compile.

We can't run `--dry-run` outside a bundle (the early `Bundle.main.bundleIdentifier` guard fires). That's intentional. We'll exercise this in Task 4.

- [ ] **Step 3: Commit**

```bash
git add scripts/notifier-src/main.swift
git commit -m "feat(notifier): parse CLI args (--title/--message/--sound/--group/--prime/--dry-run)"
```

---

### Task 3: Click handling + signal file + editor launch

**Files:**
- Modify: `scripts/notifier-src/main.swift`

- [ ] **Step 1: Replace main.swift with the full version**

Overwrite `scripts/notifier-src/main.swift`:

```swift
import Foundation
import UserNotifications

struct Args {
    var title: String = "Claude Code SuperNotifier"
    var message: String = ""
    var sound: String? = nil
    var group: String? = nil
    var signalPath: String? = nil
    var clickTouch: String? = nil
    var clickOpen: String? = nil
    var editorCli: String = "/usr/local/bin/code"
    var timeout: Double = 30
    var prime: Bool = false
    var dryRun: Bool = false
}

func parseArgs() -> Args {
    var a = Args()
    var it = CommandLine.arguments.dropFirst().makeIterator()
    while let arg = it.next() {
        switch arg {
        case "--title":       if let v = it.next() { a.title = v }
        case "--message":     if let v = it.next() { a.message = v }
        case "--sound":       if let v = it.next() { a.sound = v }
        case "--group":       if let v = it.next() { a.group = v }
        case "--signal-path": if let v = it.next() { a.signalPath = v }
        case "--click-touch": if let v = it.next() { a.clickTouch = v }
        case "--click-open":  if let v = it.next() { a.clickOpen = v }
        case "--editor-cli":  if let v = it.next() { a.editorCli = v }
        case "--timeout":     if let v = it.next(), let d = Double(v) { a.timeout = d }
        case "--prime":       a.prime = true
        case "--dry-run":     a.dryRun = true
        default: break
        }
    }
    return a
}

final class Delegate: NSObject, UNUserNotificationCenterDelegate {
    let onClick: () -> Void
    init(onClick: @escaping () -> Void) { self.onClick = onClick }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler handler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        handler([.banner, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler handler: @escaping () -> Void
    ) {
        onClick()
        handler()
    }
}

func runClickActions(_ args: Args) {
    if let p = args.clickTouch {
        FileManager.default.createFile(atPath: p, contents: Data(), attributes: nil)
    }
    if let workspace = args.clickOpen {
        let task = Process()
        task.launchPath = args.editorCli
        task.arguments = [workspace]
        do { try task.run() } catch {
            FileHandle.standardError.write(Data("editor launch failed: \(error)\n".utf8))
        }
    }
}

guard let bundleId = Bundle.main.bundleIdentifier, !bundleId.isEmpty else {
    FileHandle.standardError.write(Data("notifier must be launched from inside its .app bundle\n".utf8))
    exit(2)
}

let args = parseArgs()

if args.dryRun {
    let payload: [String: Any] = [
        "bundleId": bundleId,
        "title": args.title,
        "message": args.message,
        "sound": args.sound as Any,
        "group": args.group as Any,
        "signalPath": args.signalPath as Any,
        "clickTouch": args.clickTouch as Any,
        "clickOpen": args.clickOpen as Any,
        "editorCli": args.editorCli,
        "timeout": args.timeout,
        "prime": args.prime
    ]
    if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
       let s = String(data: data, encoding: .utf8) {
        print(s)
    }
    exit(0)
}

let center = UNUserNotificationCenter.current()
let authGroup = DispatchGroup()
authGroup.enter()
center.requestAuthorization(options: [.alert, .sound]) { _, _ in authGroup.leave() }
authGroup.wait()

if args.prime { exit(0) }

let exitGroup = DispatchGroup()
exitGroup.enter()
var didFire = false
let lock = NSLock()
let delegate = Delegate(onClick: {
    lock.lock()
    let already = didFire
    didFire = true
    lock.unlock()
    if !already {
        runClickActions(args)
        exitGroup.leave()
    }
})
center.delegate = delegate

let content = UNMutableNotificationContent()
content.title = args.title
content.body = args.message
if let s = args.sound, !s.isEmpty {
    content.sound = UNNotificationSound(named: UNNotificationSoundName(s))
}
if let g = args.group, !g.isEmpty {
    content.threadIdentifier = g
}

let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
let postGroup = DispatchGroup()
postGroup.enter()
center.add(request) { _ in postGroup.leave() }
postGroup.wait()

DispatchQueue.global().asyncAfter(deadline: .now() + args.timeout) {
    lock.lock()
    let already = didFire
    didFire = true
    lock.unlock()
    if !already {
        exitGroup.leave()
    }
}

exitGroup.wait()
exit(0)
```

- [ ] **Step 2: Recompile**

Run:
```bash
xcrun -sdk macosx swiftc -O \
  -target arm64-apple-macos11 \
  -framework UserNotifications \
  -o scripts/notifier-src/build/notifier-arm64 \
  scripts/notifier-src/main.swift
```
Expected: clean compile.

- [ ] **Step 3: Commit**

```bash
git add scripts/notifier-src/main.swift
git commit -m "feat(notifier): handle clicks (signal file + editor launch) with timeout"
```

---

## Phase 2: Build Pipeline

### Task 4: Universal binary + ad-hoc signed `.app`

**Files:**
- Modify: `scripts/build-notifier-app.ts`
- Modify (later, in Task 11): `media/ClaudeCodeSupernotifier.app/**` (regenerated artifact)

- [ ] **Step 1: Replace the build script**

Overwrite `scripts/build-notifier-app.ts`:

```typescript
#!/usr/bin/env node
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PNG = path.join(ROOT, 'media', 'icon.png');
const APP_NAME = 'ClaudeCodeSupernotifier.app';
const BUNDLE_ID = 'com.alimtunc.claude-code-supernotifier';
const BUNDLE_NAME = 'Claude Code SuperNotifier';
const EXECUTABLE = 'ClaudeCodeSupernotifier';
const APP_DIR = path.join(ROOT, 'media', APP_NAME);
const SWIFT_SRC = path.join(ROOT, 'scripts', 'notifier-src', 'main.swift');
const SWIFT_BUILD = path.join(ROOT, 'scripts', 'notifier-src', 'build');
const MIN_MACOS = '11';

const ICON_SIZES: Array<{ size: number; name: string }> = [
  { size: 16, name: 'icon_16x16.png' },
  { size: 32, name: 'icon_16x16@2x.png' },
  { size: 32, name: 'icon_32x32.png' },
  { size: 64, name: 'icon_32x32@2x.png' },
  { size: 128, name: 'icon_128x128.png' },
  { size: 256, name: 'icon_128x128@2x.png' },
  { size: 256, name: 'icon_256x256.png' },
  { size: 512, name: 'icon_256x256@2x.png' }
];

function run(cmd: string, args: string[]): void {
  const result = cp.spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with status ${result.status}`);
  }
}

function buildIcns(): string {
  if (!fs.existsSync(SOURCE_PNG)) {
    throw new Error(`Missing source PNG at ${SOURCE_PNG}`);
  }
  const iconset = path.join(ROOT, 'media', 'AppIcon.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });
  for (const { size, name } of ICON_SIZES) {
    run('/usr/bin/sips', [
      '-z', String(size), String(size),
      SOURCE_PNG,
      '--out', path.join(iconset, name)
    ]);
  }
  const icns = path.join(ROOT, 'media', 'AppIcon.icns');
  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', icns]);
  fs.rmSync(iconset, { recursive: true, force: true });
  return icns;
}

function buildSwiftBinary(): string {
  fs.rmSync(SWIFT_BUILD, { recursive: true, force: true });
  fs.mkdirSync(SWIFT_BUILD, { recursive: true });

  const archs: Array<'arm64' | 'x86_64'> = ['arm64', 'x86_64'];
  const slices: string[] = [];
  for (const arch of archs) {
    const out = path.join(SWIFT_BUILD, `notifier-${arch}`);
    run('/usr/bin/xcrun', [
      '-sdk', 'macosx',
      'swiftc',
      '-O',
      '-target', `${arch}-apple-macos${MIN_MACOS}`,
      '-framework', 'UserNotifications',
      '-o', out,
      SWIFT_SRC
    ]);
    slices.push(out);
  }

  const universal = path.join(SWIFT_BUILD, EXECUTABLE);
  run('/usr/bin/lipo', ['-create', '-output', universal, ...slices]);
  return universal;
}

function buildAppBundle(icns: string, binary: string): void {
  fs.rmSync(APP_DIR, { recursive: true, force: true });
  const contents = path.join(APP_DIR, 'Contents');
  const macOS = path.join(contents, 'MacOS');
  const resources = path.join(contents, 'Resources');
  fs.mkdirSync(macOS, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });

  fs.copyFileSync(icns, path.join(resources, 'AppIcon.icns'));
  fs.rmSync(icns, { force: true });

  const exePath = path.join(macOS, EXECUTABLE);
  fs.copyFileSync(binary, exePath);
  fs.chmodSync(exePath, 0o755);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>${BUNDLE_NAME}</string>
    <key>CFBundleExecutable</key>
    <string>${EXECUTABLE}</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${BUNDLE_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>${MIN_MACOS}.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSUserNotificationAlertStyle</key>
    <string>banner</string>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(contents, 'Info.plist'), plist, 'utf8');
}

function adHocSign(): void {
  run('/usr/bin/codesign', ['-s', '-', '--force', '--deep', APP_DIR]);
}

function main(): void {
  if (process.platform !== 'darwin') {
    console.error('build-notifier-app must run on macOS (uses sips/iconutil/swiftc).');
    process.exit(1);
  }
  const icns = buildIcns();
  const binary = buildSwiftBinary();
  buildAppBundle(icns, binary);
  adHocSign();
  console.log(`Built ${APP_DIR}`);
}

main();
```

- [ ] **Step 2: Run the build**

```bash
pnpm build:notifier-app
```
Expected:
- `media/ClaudeCodeSupernotifier.app/Contents/MacOS/ClaudeCodeSupernotifier` exists
- `file media/ClaudeCodeSupernotifier.app/Contents/MacOS/ClaudeCodeSupernotifier` reports `Mach-O universal binary with 2 architectures: [arm64], [x86_64]`
- `codesign -dv media/ClaudeCodeSupernotifier.app` reports `Signature=adhoc`

- [ ] **Step 3: Smoke-test the bundle directly with `--dry-run`**

Run:
```bash
./media/ClaudeCodeSupernotifier.app/Contents/MacOS/ClaudeCodeSupernotifier \
  --dry-run --title "Smoke" --message "ok"
```
Expected: prints a JSON object containing `"bundleId": "com.alimtunc.claude-code-supernotifier"` and the parsed args. Exit code 0.

If you instead see `notifier must be launched from inside its .app bundle`, the `Info.plist` has the wrong `CFBundleExecutable` or the binary was placed outside `Contents/MacOS/`. Check the layout.

- [ ] **Step 4: Smoke-test a real notification**

Run:
```bash
./media/ClaudeCodeSupernotifier.app/Contents/MacOS/ClaudeCodeSupernotifier \
  --title "Octopus" --message "real notif" --sound Glass --timeout 5
```
Expected:
- First time only: macOS notification permission prompt for **Claude Code SuperNotifier**. Click **Allow**.
- A banner appears titled **Claude Code SuperNotifier** (the bundle display name) → "Octopus" → "real notif", with the **octopus icon** on the left.
- Process exits within ~5s (timeout).

If the icon is still generic: `sudo rm -rf /Library/Caches/com.apple.iconservices.store && killall Dock NotificationCenter` and retry.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-notifier-app.ts media/ClaudeCodeSupernotifier.app
git commit -m "feat(notifier): build universal swift binary + ad-hoc signed .app bundle"
```

---

## Phase 3: Wire the TS Hook to the Swift Binary

### Task 5: Rewrite `src/hook/notifier.ts` (TDD)

**Files:**
- Modify: `src/hook/notifier.ts`
- Create: `src/hook/notifier.test.ts`
- Modify: `src/hook/types.ts`

- [ ] **Step 1: Update `HookConfig` to remove dead fields and add the binary path**

Edit `src/hook/types.ts`:
- Remove field: `terminalNotifierPath?: string;`
- Remove field: `senderBundleId?: string;`
- Add field: `notifierBinaryPath?: string;`

Final shape:
```typescript
export interface HookConfig {
  notifyOnStop?: boolean;
  notifyOnAttention?: boolean;
  sound?: string;
  titleTemplate?: string;
  messageTemplate?: string;
  includeBranch?: boolean;
  allowedRepos?: string[];
  customRepoNames?: Record<string, string>;
  focusOnClick?: boolean;
  editorUriScheme?: string;
  extensionUriAuthority?: string;
  notifierBinaryPath?: string;
  editorCliPath?: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/hook/notifier.test.ts`:

```typescript
import * as cp from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyMacOS } from './notifier';
import type { HookConfig, NormalisedEvent } from './types';

const baseEvent: NormalisedEvent = {
  cwd: '/tmp/repo',
  repo: 'repo',
  branch: 'main',
  event: 'Stop',
  eventLabel: 'Réponse terminée',
  notificationType: '',
  notificationMessage: '',
  sessionId: 'sess-1',
  transcriptPath: '/tmp/repo/.transcript',
  workspaceRoot: '/tmp/repo',
  focusUri: '',
  clickedPath: '/tmp/state/clicked',
  signalPath: '/tmp/state/signal.json',
  title: 'Claude: repo',
  message: 'Réponse terminée · main',
  createdAt: '2026-05-04T00:00:00.000Z',
  raw: {}
};

const fakeChild = { unref: () => {} } as unknown as cp.ChildProcess;

describe('notifyMacOS', () => {
  let spawnSpy: ReturnType<typeof vi.spyOn>;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    spawnSpy = vi.spyOn(cp, 'spawn').mockReturnValue(fakeChild);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('skips on non-darwin platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    notifyMacOS(baseEvent, { notifierBinaryPath: '/tmp/bin' });

    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it('does nothing when notifierBinaryPath is missing', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    notifyMacOS(baseEvent, {});

    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it('spawns the swift binary with the expected CLI args', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const config: HookConfig = {
      notifierBinaryPath: '/tmp/bundle/ClaudeCodeSupernotifier',
      sound: 'Glass',
      focusOnClick: true,
      editorCliPath: '/usr/local/bin/code'
    };

    notifyMacOS(baseEvent, config);

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnSpy.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('/tmp/bundle/ClaudeCodeSupernotifier');
    expect(args).toContain('--title');
    expect(args).toContain('Claude: repo');
    expect(args).toContain('--message');
    expect(args).toContain('Réponse terminée · main');
    expect(args).toContain('--sound');
    expect(args).toContain('Glass');
    expect(args).toContain('--group');
    expect(args).toContain('sess-1');
    expect(args).toContain('--signal-path');
    expect(args).toContain('/tmp/state/signal.json');
    expect(args).toContain('--click-touch');
    expect(args).toContain('/tmp/state/clicked');
    expect(args).toContain('--click-open');
    expect(args).toContain('/tmp/repo');
    expect(args).toContain('--editor-cli');
    expect(args).toContain('/usr/local/bin/code');
  });

  it('omits click args when focusOnClick is false', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    notifyMacOS(baseEvent, {
      notifierBinaryPath: '/tmp/bundle/ClaudeCodeSupernotifier',
      focusOnClick: false
    });

    const [, args] = spawnSpy.mock.calls[0] as [string, string[], unknown];
    expect(args).not.toContain('--click-touch');
    expect(args).not.toContain('--click-open');
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
pnpm test -- src/hook/notifier.test.ts
```
Expected: tests fail because `notifyMacOS` still spawns `terminal-notifier`.

- [ ] **Step 4: Replace `src/hook/notifier.ts`**

Overwrite `src/hook/notifier.ts`:

```typescript
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HookConfig, NormalisedEvent } from './types';

const NOTIFIER_TIMEOUT_MS = 5000;

export function notifyMacOS(event: NormalisedEvent, config: HookConfig): void {
  if (process.platform !== 'darwin') {
    return;
  }
  const binary = config.notifierBinaryPath;
  if (!binary) {
    return;
  }

  writeSignal(event);

  const args = [
    '--title', event.title,
    '--message', event.message,
    '--group', event.sessionId || event.cwd,
    '--signal-path', event.signalPath
  ];

  if (config.sound) {
    args.push('--sound', config.sound);
  }

  if (config.focusOnClick !== false && event.workspaceRoot) {
    if (event.clickedPath) {
      args.push('--click-touch', event.clickedPath);
    }
    args.push('--click-open', event.workspaceRoot);
    if (config.editorCliPath) {
      args.push('--editor-cli', config.editorCliPath);
    }
  }

  cp.spawn(binary, args, {
    detached: true,
    stdio: 'ignore'
  }).unref();
  // We use spawn (not spawnSync) so the hook returns immediately while the
  // notifier waits up to its --timeout for a click. spawnSync is only used
  // in tests via the spy override.
}

function writeSignal(event: NormalisedEvent): void {
  try {
    fs.mkdirSync(path.dirname(event.signalPath), { recursive: true });
    fs.writeFileSync(
      event.signalPath,
      JSON.stringify(
        {
          cwd: event.cwd,
          workspaceRoot: event.workspaceRoot,
          sessionId: event.sessionId,
          transcriptPath: event.transcriptPath,
          title: event.title,
          message: event.message,
          createdAt: event.createdAt
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {
    // Best-effort.
  }
}
```

- [ ] **Step 5: Run the tests, verify they pass**

```bash
pnpm test -- src/hook/notifier.test.ts
```
Expected: 4 passing tests.

- [ ] **Step 6: Run full suite**

```bash
pnpm test
```
Expected: full suite green (existing tests may need updates if they referenced `terminalNotifierPath` — see Task 6).

- [ ] **Step 7: Commit**

```bash
git add src/hook/notifier.ts src/hook/notifier.test.ts src/hook/types.ts
git commit -m "feat(hook): spawn the swift notifier binary instead of terminal-notifier"
```

---

### Task 6: Config layer — drop terminal-notifier fields, resolve binary path

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `src/notifierApp.ts` (export the binary path helper)
- Modify: `src/shared/binaries.ts` (search file references; nothing to remove if `terminal-notifier` isn't hardcoded as a constant)

- [ ] **Step 1: Update the public `SupernotifierConfig` type**

Edit `src/types.ts`:
- Remove field `terminalNotifierPath: string;`
- Remove field `senderBundleId: string;`
- Add field `notifierBinaryPath: string;`

Final shape:
```typescript
export interface SupernotifierConfig {
  notifyOnStop: boolean;
  notifyOnAttention: boolean;
  sound: string;
  titleTemplate: string;
  messageTemplate: string;
  includeBranch: boolean;
  allowedRepos: string[];
  customRepoNames: Record<string, string>;
  focusOnClick: boolean;
  editorUriScheme: string;
  extensionUriAuthority: string;
  notifierBinaryPath: string;
  claudeOpenSessionCommand: string;
  claudeFocusCommand: string;
  editorCliPath: string;
}
```

- [ ] **Step 2: Add a binary-path helper to `src/notifierApp.ts`**

Add to `src/notifierApp.ts` (alongside `installedNotifierAppPath`):

```typescript
export function notifierBinaryPath(): string {
  return path.join(installedNotifierAppPath(), 'Contents', 'MacOS', 'ClaudeCodeSupernotifier');
}
```

- [ ] **Step 3: Replace `src/config.ts`**

Overwrite `src/config.ts`:

```typescript
import * as vscode from 'vscode';
import { CONFIG_SECTION } from './constants';
import { notifierBinaryPath } from './notifierApp';
import { findMacBinary } from './shared/binaries';
import { DEFAULTS, EXTENSION_URI_AUTHORITY } from './shared/constants';
import type { SupernotifierConfig } from './types';

export function getRuntimeConfig(): SupernotifierConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    notifyOnStop: config.get('notifyOnStop', DEFAULTS.notifyOnStop),
    notifyOnAttention: config.get('notifyOnAttention', DEFAULTS.notifyOnAttention),
    sound: config.get('sound', DEFAULTS.sound),
    titleTemplate: config.get('titleTemplate', DEFAULTS.titleTemplate),
    messageTemplate: config.get('messageTemplate', DEFAULTS.messageTemplate),
    includeBranch: config.get('includeBranch', DEFAULTS.includeBranch),
    allowedRepos: config.get('allowedRepos', []),
    customRepoNames: config.get('customRepoNames', {}),
    focusOnClick: config.get('focusOnClick', DEFAULTS.focusOnClick),
    editorUriScheme: vscode.env.uriScheme,
    extensionUriAuthority: EXTENSION_URI_AUTHORITY,
    notifierBinaryPath: notifierBinaryPath(),
    claudeOpenSessionCommand: config.get('claudeOpenSessionCommand', DEFAULTS.claudeOpenSessionCommand),
    claudeFocusCommand: config.get('claudeFocusCommand', DEFAULTS.claudeFocusCommand),
    editorCliPath: config.get('editorCliPath', '') || findMacBinary('code')
  };
}
```

- [ ] **Step 4: Find and remove dead `terminal-notifier` references**

```bash
grep -rn 'terminal-notifier\|terminalNotifierPath\|senderBundleId\|configureMacNotifier' src/
```
Expected after this step: only references inside `src/commands.ts` (handled in Task 8) and tests (handled in Task 9).

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config.ts src/notifierApp.ts
git commit -m "refactor(config): replace terminal-notifier wiring with notifierBinaryPath"
```

---

### Task 7: Extension activation — chmod, prime, drop lsregister

**Files:**
- Modify: `src/notifierApp.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Replace `src/notifierApp.ts`**

Overwrite the file completely (keep existing exports `NOTIFIER_APP_NAME`, `NOTIFIER_BUNDLE_ID`, `installedNotifierAppPath`, `notifierBinaryPath`, `ensureNotifierApp`):

```typescript
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { appDir } from './shared/paths';

export const NOTIFIER_APP_NAME = 'ClaudeCodeSupernotifier.app';
export const NOTIFIER_BUNDLE_ID = 'com.alimtunc.claude-code-supernotifier';

const STAMP_FILE = '.notifier-app.stamp';
const PRIME_TIMEOUT_MS = 4000;

export function installedNotifierAppPath(): string {
  return path.join(appDir, NOTIFIER_APP_NAME);
}

export function notifierBinaryPath(): string {
  return path.join(installedNotifierAppPath(), 'Contents', 'MacOS', 'ClaudeCodeSupernotifier');
}

export function ensureNotifierApp(context: vscode.ExtensionContext): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const source = path.join(context.extensionPath, 'media', NOTIFIER_APP_NAME);
  if (!fs.existsSync(source)) {
    return;
  }

  const target = installedNotifierAppPath();
  const stampPath = path.join(appDir, STAMP_FILE);
  const sourceStamp = readStamp(source);

  const upToDate =
    fs.existsSync(target) && sourceStamp !== undefined && readStampFile(stampPath) === sourceStamp;

  if (!upToDate) {
    try {
      fs.mkdirSync(appDir, { recursive: true });
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true });
      fs.chmodSync(notifierBinaryPath(), 0o755);
      if (sourceStamp) {
        fs.writeFileSync(stampPath, sourceStamp, 'utf8');
      }
      primeAuthorization(target);
    } catch (error) {
      console.error('[claude-code-supernotifier] failed to install notifier app', error);
    }
  }
}

function primeAuthorization(appPath: string): void {
  const exe = path.join(appPath, 'Contents', 'MacOS', 'ClaudeCodeSupernotifier');
  if (!fs.existsSync(exe)) {
    return;
  }
  try {
    cp.spawnSync(exe, ['--prime'], {
      timeout: PRIME_TIMEOUT_MS,
      stdio: 'ignore'
    });
  } catch {
    // Best-effort. The user will see the permission prompt the first time
    // they receive a real notification instead.
  }
}

function readStamp(appPath: string): string | undefined {
  try {
    const plist = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'));
    const exe = fs.readFileSync(path.join(appPath, 'Contents', 'MacOS', 'ClaudeCodeSupernotifier'));
    return `${plist.length}:${exe.length}`;
  } catch {
    return undefined;
  }
}

function readStampFile(stampPath: string): string | undefined {
  try {
    return fs.readFileSync(stampPath, 'utf8');
  } catch {
    return undefined;
  }
}
```

Note: the previous `lsregister` step is gone. Launch Services discovery is no longer required for the notification path (the `.app` *is* the sender now).

- [ ] **Step 2: Typecheck + test**

```bash
pnpm typecheck && pnpm test
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/notifierApp.ts
git commit -m "refactor(notifier-app): chmod the swift binary and prime authorization on install"
```

---

## Phase 4: Drop Dead Code & Surface

### Task 8: Remove `configureMacNotifier` command + brew dep

**Files:**
- Modify: `src/commands.ts`
- Modify: `src/extension.ts`
- Modify: `src/constants.ts`
- Modify: `package.json`

- [ ] **Step 1: Remove the export and its helpers from `src/commands.ts`**

Edit `src/commands.ts`:
- Delete `configureMacNotifier`, `installTerminalNotifier`, `openMacNotificationSettings`.
- Remove the `findMacBinary` import.
- Remove the `helperPath` import if it becomes unused (it's still used by `testNotification`, keep it).

Final imports section should look like:
```typescript
import * as cp from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  installClaudeHooks as installHooks,
  isClaudeHooksInstalled,
  uninstallClaudeHooks as uninstallHooks
} from './claudeHooks';
import { CONFIG_SECTION } from './constants';
import { writeRuntimeFiles } from './runtimeFiles';
import { appDir, helperPath } from './shared/paths';
```

- [ ] **Step 2: Remove the command id from `src/constants.ts`**

Open `src/constants.ts`, find the `COMMAND_IDS` object, delete the `configureMacNotifier` key. (If the constants file references `configureMacNotifier` anywhere else, delete those too.)

- [ ] **Step 3: Drop the registration from `src/extension.ts`**

In `src/extension.ts`, remove the line:
```typescript
vscode.commands.registerCommand(COMMAND_IDS.configureMacNotifier, () =>
  commands.configureMacNotifier(context)
),
```

- [ ] **Step 4: Drop the command + setting from `package.json`**

In `package.json`:
- Remove the `claudeCodeSupernotifier.configureMacNotifier` entry from `contributes.commands`.
- Remove the `claudeCodeSupernotifier.senderBundleId` entry from `contributes.configuration.properties`.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/commands.ts src/extension.ts src/constants.ts package.json
git commit -m "chore: drop configureMacNotifier command and senderBundleId setting"
```

---

### Task 9: Update existing tests that reference removed config fields

**Files:**
- Modify: any test under `src/` referencing `terminalNotifierPath` or `senderBundleId`

- [ ] **Step 1: Find offending tests**

```bash
grep -rln 'terminalNotifierPath\|senderBundleId' src/
```

- [ ] **Step 2: For each match, remove the reference**

Open each file. Where the tests construct a `HookConfig` or `SupernotifierConfig` literal, drop those keys. Where assertions reference them, drop or replace with `notifierBinaryPath` as appropriate.

- [ ] **Step 3: Run the full suite**

```bash
pnpm test
```
Expected: green.

- [ ] **Step 4: Run lint + typecheck**

```bash
pnpm lint && pnpm typecheck
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "test: drop references to removed terminal-notifier config fields"
```

---

### Task 10: README + CHANGELOG

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Audit README for terminal-notifier mentions**

```bash
grep -n -i 'terminal-notifier\|brew install' README.md
```

- [ ] **Step 2: Rewrite the install/macOS section**

Remove every mention of `brew install terminal-notifier`. Replace with a short paragraph along the lines of:

> macOS notifications are delivered by a small bundled helper (`ClaudeCodeSupernotifier.app`) that ships with the extension. The first time a notification fires, macOS will ask you for permission to deliver notifications under "Claude Code SuperNotifier" — accept once, you're done. No Homebrew or third-party CLI required.

- [ ] **Step 3: Add a CHANGELOG entry**

Prepend to `CHANGELOG.md` (under the existing top-level format):

```
## Unreleased

- Replace the `terminal-notifier` Homebrew dependency with a bundled Swift helper. Notifications now appear under the "Claude Code SuperNotifier" identity with the octopus icon natively, and no longer require `brew install`.
- Remove the `claudeCodeSupernotifier.senderBundleId` setting and the `Configure macOS terminal-notifier` command (no longer applicable).
```

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: drop terminal-notifier from install steps; document bundled helper"
```

---

## Phase 5: End-to-End Validation

### Task 11: Package, install, and exercise the real flow

**Files:** none modified — this task is verification only.

- [ ] **Step 1: Re-build the .app from the latest sources**

```bash
pnpm build:notifier-app
```
Expected: success. Verify via `file media/ClaudeCodeSupernotifier.app/Contents/MacOS/ClaudeCodeSupernotifier` shows universal binary, and `codesign -dv` shows ad-hoc.

- [ ] **Step 2: Package the VSIX**

```bash
pnpm vsce:package
```
Expected: `claude-code-supernotifier-0.0.1.vsix` produced. Inspect the printed file list — `media/ClaudeCodeSupernotifier.app/Contents/MacOS/ClaudeCodeSupernotifier` must be present.

- [ ] **Step 3: Install locally**

```bash
code --install-extension claude-code-supernotifier-0.0.1.vsix --force
```
Expected: "successfully installed".

- [ ] **Step 4: Reload VSCode and run the test command**

In VSCode: **Developer: Reload Window**, then **Claude Code SuperNotifier: Test macOS Notification**.

Expected:
- First time only: macOS permission prompt for **Claude Code SuperNotifier**. Click **Allow**.
- Banner appears with title "Claude: <repo>", message starting with "Test notification…", **octopus icon on the left**, "Claude Code SuperNotifier" as the sender name in Notification Center.

- [ ] **Step 5: Validate click handling**

Run the test command again. Click the banner before it dismisses.

Expected:
- The banner dismisses.
- VSCode focuses (or no-op if already focused). For workspaces actually backed by a Claude Code session, the existing `clickSignals` watcher should fire its focus command.
- `~/.claude-code-supernotifier/focus-state/<workspaceHash>/clicked` was touched.

- [ ] **Step 6: Validate no-leftover-process**

```bash
pgrep -fl ClaudeCodeSupernotifier
```
Expected: no rogue notifier processes after ~30s post-test (timeout default).

- [ ] **Step 7: Run a real Claude Code session smoke**

In a real repo with Claude Code installed:
1. **Claude Code SuperNotifier: Install Claude Hooks**
2. Run `claude` and have it answer a prompt.
3. Verify a notification appears with the octopus + "Claude Code SuperNotifier" identity.
4. Verify clicking it focuses the right workspace.

- [ ] **Step 8: Final commit (if any cleanup happened during validation) and PR**

```bash
git status        # should be clean
git push -u origin swift-native-notifier
gh pr create --base main --title "feat: native swift notifier (drop terminal-notifier dependency)" --body-file docs/superpowers/plans/2026-05-04-swift-native-notifier.md
```

---

## Notes / Known Limitations

- **First-run permission prompt**: macOS shows the prompt for "Claude Code SuperNotifier" the first time. Documented in README. The `--prime` call during `ensureNotifierApp` triggers it as soon as the extension activates rather than at the first real notification, which is a friendlier UX.
- **Click after timeout**: if the user doesn't click within 30s, the spawned notifier process exits. Clicking the notification later (from Notification Center) will *not* trigger our click handler. macOS may attempt to launch the .app, our binary will run with no args, and exit immediately. This matches the prior `terminal-notifier` behavior closely enough; document only if users complain.
- **Code signing**: ad-hoc only. For marketplace publishing this is fine — VSCode extensions are not subject to Gatekeeper review themselves, and the bundled helper, being ad-hoc signed, runs without quarantine because we never download it via a quarantined path (it ships inside the `.vsix`). If we ever want to ship via DMG/PKG outside VSCode, proper Developer ID signing + notarization is a separate cycle and explicitly out of scope of this plan.
- **Universal binary size**: ~400-700 KB. Acceptable. Together with the `.icns` (~460 KB), the `.vsix` should remain under ~1.5 MB.
