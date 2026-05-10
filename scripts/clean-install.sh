#!/usr/bin/env bash
# Clean install: build VSIX, wipe extension dir + runtime state, reinstall, force-copy dist.
# `code --install-extension --force` silently leaves stale dist files when the version is unchanged,
# hence the explicit force-copy at the end. The user must reload the VSCode window after this script
# finishes so the extension host picks up the new code (we don't quit VSCode to avoid disrupting other windows).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLISHER=$(node -p "require('${REPO_ROOT}/package.json').publisher")
NAME=$(node -p "require('${REPO_ROOT}/package.json').name")
VERSION=$(node -p "require('${REPO_ROOT}/package.json').version")
EXT_ID="${PUBLISHER}.${NAME}"
VSIX="${REPO_ROOT}/${NAME}-${VERSION}.vsix"
EXT_DIR="${HOME}/.vscode/extensions/${EXT_ID}-${VERSION}"
RUNTIME_DIR="${HOME}/.claude-code-supernotifier"

echo "==> Building VSIX (${NAME}-${VERSION}.vsix)"
cd "${REPO_ROOT}"
rm -f "${REPO_ROOT}"/*.vsix
pnpm run vsce:package

echo "==> Killing stale notifier processes"
pkill -f ClaudeCodeSupernotifier 2>/dev/null || true

echo "==> Uninstalling extension"
code --uninstall-extension "${EXT_ID}" 2>/dev/null || true
rm -rf "${HOME}/.vscode/extensions/${EXT_ID}-"*

echo "==> Wiping runtime state in ${RUNTIME_DIR}"
rm -rf \
  "${RUNTIME_DIR}/ClaudeCodeSupernotifier.app" \
  "${RUNTIME_DIR}/.notifier-app.stamp" \
  "${RUNTIME_DIR}/config.json" \
  "${RUNTIME_DIR}/hook.js"

echo "==> Installing ${VSIX}"
code --install-extension "${VSIX}" --force

echo "==> Force-copying dist/{extension,hook}.js (works around VSCode silently keeping stale dist)"
unzip -p "${VSIX}" extension/dist/extension.js > "${EXT_DIR}/dist/extension.js"
unzip -p "${VSIX}" extension/dist/hook.js > "${EXT_DIR}/dist/hook.js"

cat <<EOF

✅ Clean install done.

Next steps:
  1. In VSCode: Cmd+Shift+P → "Developer: Reload Window" (drops the old extension host)
  2. Allow notifications for "Claude Code SuperNotifier" if macOS prompts
  3. Cmd+Shift+P → "Claude Code SuperNotifier: Test macOS Notification"
  4. Cmd+Shift+P → "Claude Code SuperNotifier: Install Claude Hooks" (rewrites ~/.claude/settings.json)
EOF
