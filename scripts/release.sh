#!/usr/bin/env bash
# Release helper. Auto-detects bump kind from conventional commits since the
# last v*.*.* tag, runs the full verification pipeline, bumps package.json and
# CHANGELOG, then commits and tags. Optionally pushes to trigger the release
# workflow.
#
# Usage:
#   pnpm release [patch|minor|major] [--dry-run] [--yes] [--push]
#
# The actual GitHub release + Marketplace publish is delegated to
# .github/workflows/release.yml, triggered by the pushed tag.

set -euo pipefail

REPO="alimtunc/claude-code-supernotifier"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ─── Theme ───
GREEN="78"
BLUE="69"
YELLOW="220"
RED="196"
GRAY="240"

# ─── Args ───
DRY_RUN=false
YES=false
PUSH=false
FORCED_KIND=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --yes | -y) YES=true ;;
    --push) PUSH=true ;;
    patch | minor | major)
      [[ -n "$FORCED_KIND" ]] && { echo "Bump kind given twice."; exit 1; }
      FORCED_KIND="$1" ;;
    --) ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

# ─── Helpers ───
header() {
  echo ""
  gum style --bold --foreground "$GREEN" --border double --border-foreground "$GREEN" \
    --padding "0 2" --margin "0 0" "$1"
}

label()    { gum style --bold --foreground "$BLUE" "  $1"; }
success()  { gum style --foreground "$GREEN" "  ✓ $1"; }
err()      { gum style --foreground "$RED" "  ✗ $1"; }
muted()    { gum style --faint "  $1"; }
divider()  { gum style --foreground "$GRAY" "  ──────────────────────────────────────"; }

styled_confirm() {
  gum confirm --selected.background "$GREEN" "$@"
}

commit_line() {
  echo "    $(gum style --foreground "$BLUE" "$1") $(gum style --faint "—") $2"
}

# ─── check_dependencies ───
check_dependencies() {
  local missing=0
  for cmd in gum jq pnpm node git; do
    if ! command -v "$cmd" &>/dev/null; then
      err "Missing: $cmd"
      [[ "$cmd" == "gum" || "$cmd" == "jq" ]] && muted "brew install $cmd"
      missing=1
    fi
  done
  [[ $missing -eq 1 ]] && exit 1
  return 0
}

# ─── detect_state ───
detect_state() {
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  PREV_TAG=$(git describe --tags --abbrev=0 --match 'v*.*.*' 2>/dev/null || echo "")
  CURRENT_VERSION=$(jq -r .version package.json)

  if [[ -n "$PREV_TAG" ]]; then
    COMMIT_RANGE="${PREV_TAG}..HEAD"
  else
    COMMIT_RANGE="HEAD"
  fi

  COMMIT_LIST=$(git log "$COMMIT_RANGE" --format='%h%x09%s' || true)
  if [[ -n "$COMMIT_LIST" ]]; then
    COMMIT_COUNT=$(echo "$COMMIT_LIST" | wc -l | tr -d ' ')
  else
    COMMIT_COUNT=0
  fi
}

# ─── detect_bump_kind ───
detect_bump_kind() {
  if [[ -n "$FORCED_KIND" ]]; then
    BUMP_KIND="$FORCED_KIND"
    BUMP_SOURCE="forced"
    return
  fi

  local breaking_body breaking_marker feat_count
  breaking_body=$(git log "$COMMIT_RANGE" --format='%B' 2>/dev/null | grep -cE 'BREAKING CHANGE' || true)
  breaking_marker=$(git log "$COMMIT_RANGE" --format='%s' 2>/dev/null | grep -cE '^[a-z]+(\([^)]+\))?!:' || true)
  feat_count=$(git log "$COMMIT_RANGE" --format='%s' 2>/dev/null | grep -cE '^feat(\([^)]+\))?:' || true)

  if [[ ${breaking_body:-0} -gt 0 || ${breaking_marker:-0} -gt 0 ]]; then
    BUMP_KIND="major"
  elif [[ ${feat_count:-0} -gt 0 ]]; then
    BUMP_KIND="minor"
  else
    BUMP_KIND="patch"
  fi
  BUMP_SOURCE="auto"
}

# ─── compute_next_version ───
compute_next_version() {
  IFS='.' read -r maj min pat <<< "$CURRENT_VERSION"
  case "$BUMP_KIND" in
    major) NEXT_VERSION="$((maj + 1)).0.0" ;;
    minor) NEXT_VERSION="${maj}.$((min + 1)).0" ;;
    patch) NEXT_VERSION="${maj}.${min}.$((pat + 1))" ;;
  esac
  NEXT_TAG="v${NEXT_VERSION}"

  if git rev-parse --verify "refs/tags/${NEXT_TAG}" &>/dev/null; then
    err "Tag ${NEXT_TAG} already exists."
    exit 1
  fi
}

# ─── plan_changelog ───
plan_changelog() {
  if grep -q '^## \[Unreleased\]' CHANGELOG.md 2>/dev/null; then
    CHANGELOG_PLAN="rename-unreleased"
    CHANGELOG_STUB=""
    return
  fi
  CHANGELOG_PLAN="stub"
  CHANGELOG_STUB=$(build_stub_block)
}

# ─── build_stub_block ───
build_stub_block() {
  local date_iso added=() fixed=() changed=()
  date_iso=$(date -u +%Y-%m-%d)

  while IFS=$'\t' read -r _hash subject; do
    [[ -z "${subject:-}" ]] && continue
    case "$subject" in
      feat\(*\)!:* | feat\(*\):*  | feat:*  | feat!:*)  added+=("${subject#*: }") ;;
      fix\(*\)!:*  | fix\(*\):*   | fix:*   | fix!:*)   fixed+=("${subject#*: }") ;;
      refactor\(*\)*: | refactor:* | perf\(*\)*: | perf:* | chore\(*\)*: | chore:*)
        changed+=("${subject#*: }") ;;
    esac
  done <<< "$COMMIT_LIST"

  local out="## [${NEXT_VERSION}] - ${date_iso}"
  if [[ ${#added[@]} -gt 0 ]]; then
    out+=$'\n\n### Added\n'
    for line in "${added[@]}"; do out+=$'\n'"- ${line}"; done
  fi
  if [[ ${#changed[@]} -gt 0 ]]; then
    out+=$'\n\n### Changed\n'
    for line in "${changed[@]}"; do out+=$'\n'"- ${line}"; done
  fi
  if [[ ${#fixed[@]} -gt 0 ]]; then
    out+=$'\n\n### Fixed\n'
    for line in "${fixed[@]}"; do out+=$'\n'"- ${line}"; done
  fi
  printf '%s\n' "$out"
}

# ─── display_plan ───
display_plan() {
  header "Release Plan"
  echo ""
  echo "  $(gum style --bold --width 18 'Branch')$(gum style --foreground "$GREEN" "$BRANCH")"
  echo "  $(gum style --bold --width 18 'Previous tag')$(gum style --faint "${PREV_TAG:-(none)}")"
  echo "  $(gum style --bold --width 18 'Current version')$(gum style --foreground "$YELLOW" "$CURRENT_VERSION")"
  echo "  $(gum style --bold --width 18 'Next version')$(gum style --foreground "$GREEN" "$NEXT_VERSION") $(gum style --faint "(${BUMP_KIND}, ${BUMP_SOURCE})")"
  echo "  $(gum style --bold --width 18 'Next tag')$(gum style --foreground "$GREEN" "$NEXT_TAG")"
  echo "  $(gum style --bold --width 18 'Commits')$COMMIT_COUNT"
  echo ""

  if [[ "$COMMIT_COUNT" -gt 0 ]]; then
    label "Commits in this release:"
    echo ""
    while IFS=$'\t' read -r hash subject; do
      [[ -z "${subject:-}" ]] && continue
      commit_line "$hash" "$subject"
    done <<< "$COMMIT_LIST"
    echo ""
  fi

  divider
  echo ""
  if [[ "$CHANGELOG_PLAN" == "rename-unreleased" ]]; then
    label "CHANGELOG"
    muted "Existing [Unreleased] block will be renamed to [${NEXT_VERSION}]."
  else
    label "CHANGELOG (auto-generated stub):"
    echo ""
    while IFS= read -r line; do
      muted "$line"
    done <<< "$CHANGELOG_STUB"
  fi
  echo ""
}

# ─── run_verification ───
run_verification() {
  header "Verification"
  echo ""
  for step in lint format:check typecheck test; do
    gum spin --spinner dot --title "pnpm run $step..." --show-error -- pnpm run "$step"
    success "pnpm run $step"
  done
  gum spin --spinner dot --title "esbuild --production..." --show-error -- node esbuild.js --production
  success "esbuild --production"
  echo ""
}

# ─── apply_release ───
apply_release() {
  local tmp date_iso
  date_iso=$(date -u +%Y-%m-%d)

  tmp=$(mktemp)
  jq --indent 2 --arg v "$NEXT_VERSION" '.version = $v' package.json > "$tmp" && mv "$tmp" package.json

  if [[ "$CHANGELOG_PLAN" == "rename-unreleased" ]]; then
    sed -i '' "s|^## \[Unreleased\][^$]*$|## [${NEXT_VERSION}] - ${date_iso}|" CHANGELOG.md
  else
    NEXT_BLOCK="$CHANGELOG_STUB" node -e "
      const fs = require('node:fs');
      const content = fs.readFileSync('CHANGELOG.md', 'utf8');
      const block = process.env.NEXT_BLOCK;
      const m = content.match(/^## \[/m);
      if (m && m.index !== undefined) {
        fs.writeFileSync('CHANGELOG.md', content.slice(0, m.index) + block + '\n' + content.slice(m.index));
      } else {
        fs.writeFileSync('CHANGELOG.md', content.replace(/\n*$/, '\n\n') + block + '\n');
      }
    "
  fi

  git add package.json CHANGELOG.md
  git commit -m "chore(release): ${NEXT_TAG}" --quiet
  git tag "${NEXT_TAG}"

  success "Committed and tagged ${NEXT_TAG}"
}

# ─── push_release ───
push_release() {
  echo ""
  if [[ "$YES" != "true" ]] && ! styled_confirm --affirmative "Push" --negative "Skip" "Push origin ${BRANCH} and ${NEXT_TAG} now?"; then
    muted "Skipped. Run later: git push origin ${BRANCH} ${NEXT_TAG}"
    return
  fi

  gum spin --spinner dot --title "Pushing ${BRANCH}..." --show-error -- git push origin "${BRANCH}"
  success "Pushed ${BRANCH}"
  gum spin --spinner dot --title "Pushing ${NEXT_TAG}..." --show-error -- git push origin "${NEXT_TAG}"
  success "Pushed ${NEXT_TAG}"

  echo ""
  gum style --border rounded --border-foreground "$GREEN" --padding "0 2" --margin "0 2" \
    "Tag pushed — release workflow triggered" "" "https://github.com/${REPO}/actions"
}

# ─── main ───
main() {
  check_dependencies

  if [[ "$DRY_RUN" != "true" && -n "$(git status --porcelain)" ]]; then
    err "Working tree not clean. Commit or stash first."
    git status --short
    exit 1
  fi

  detect_state
  detect_bump_kind
  compute_next_version
  plan_changelog
  display_plan

  if [[ "$DRY_RUN" == "true" ]]; then
    muted "--dry-run: nothing was modified."
    exit 0
  fi

  if [[ "$BRANCH" != "main" && "$YES" != "true" ]]; then
    if ! styled_confirm --affirmative "Continue" --negative "Cancel" "You're on '${BRANCH}', not main. Proceed?"; then
      muted "Aborted."
      exit 0
    fi
  fi

  if [[ "$YES" != "true" ]]; then
    if ! styled_confirm --affirmative "Bump" --negative "Cancel" "Bump ${CURRENT_VERSION} → ${NEXT_VERSION} and tag ${NEXT_TAG}?"; then
      muted "Aborted."
      exit 0
    fi
  fi

  run_verification
  apply_release

  if [[ "$PUSH" == "true" ]]; then
    push_release
  else
    echo ""
    gum style --border rounded --border-foreground "$GREEN" --padding "0 2" --margin "0 2" \
      "Tagged ${NEXT_TAG}" "" "Next: git push origin ${BRANCH} ${NEXT_TAG}"
  fi
}

main "$@"
