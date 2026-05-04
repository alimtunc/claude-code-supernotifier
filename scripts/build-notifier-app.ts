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
    run('/usr/bin/sips', ['-z', String(size), String(size), SOURCE_PNG, '--out', path.join(iconset, name)]);
  }

  const icns = path.join(ROOT, 'media', 'AppIcon.icns');
  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', icns]);
  fs.rmSync(iconset, { recursive: true, force: true });
  return icns;
}

function buildAppBundle(icns: string): void {
  fs.rmSync(APP_DIR, { recursive: true, force: true });
  const contents = path.join(APP_DIR, 'Contents');
  const macOS = path.join(contents, 'MacOS');
  const resources = path.join(contents, 'Resources');
  fs.mkdirSync(macOS, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });

  fs.copyFileSync(icns, path.join(resources, 'AppIcon.icns'));
  fs.rmSync(icns, { force: true });

  const stub = path.join(macOS, EXECUTABLE);
  fs.writeFileSync(stub, '#!/bin/sh\nexit 0\n', 'utf8');
  fs.chmodSync(stub, 0o755);

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
    <key>LSUIElement</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(contents, 'Info.plist'), plist, 'utf8');
}

function main(): void {
  if (process.platform !== 'darwin') {
    console.error('build-notifier-app must run on macOS (uses sips/iconutil).');
    process.exit(1);
  }
  const icns = buildIcns();
  buildAppBundle(icns);
  console.log(`Built ${APP_DIR}`);
}

main();
