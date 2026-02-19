# Tauri v2 CI/CD Pipeline Guide

> A complete, copy-paste-ready guide for setting up automated CI checks and GitHub Releases for Tauri v2 desktop apps. Designed to be followed by both humans and AI agents.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Version Sync Strategy](#version-sync-strategy)
4. [Pipeline 1: CI (Continuous Integration)](#pipeline-1-ci)
5. [Pipeline 2: Release (Auto-Versioning + Build + Publish)](#pipeline-2-release)
6. [How the Auto-Version Bump Works](#how-the-auto-version-bump-works)
7. [How the Release Bot Works](#how-the-release-bot-works)
8. [Setup Instructions (Step by Step)](#setup-instructions)
9. [Adapting for Your Project](#adapting-for-your-project)
10. [Adapting for Multiple Platforms](#adapting-for-multiple-platforms)
11. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Push to main ──┬──> CI Workflow (ci.yml)
               │      ├── Install Rust + Bun
               │      ├── bun install
               │      ├── TypeScript check (bun run build)
               │      └── Rust check (cargo check)
               │
               └──> Release Workflow (release.yml)
                      │
                      ├── Job 1: check-and-bump (ubuntu-latest)
                      │     ├── Read current version from tauri.conf.json
                      │     ├── Check if git tag v{version} exists
                      │     ├── If tag exists AND new commits exist:
                      │     │     ├── Auto-bump patch version (0.1.8 → 0.1.9)
                      │     │     ├── Update 3 files (tauri.conf.json, package.json, Cargo.toml)
                      │     │     └── Commit + push with [skip ci]
                      │     ├── If tag exists AND no new commits: skip release
                      │     └── If tag doesn't exist: first release, use current version
                      │
                      └── Job 2: release (windows-latest) — only if should_release=true
                            ├── Checkout latest (with bumped version)
                            ├── Install Rust + Bun
                            ├── bun install
                            └── tauri-apps/tauri-action@v0
                                  ├── Builds frontend (vite build)
                                  ├── Builds Rust backend (cargo build --release)
                                  ├── Bundles installers (.msi + .exe)
                                  ├── Creates git tag v{version}
                                  └── Creates GitHub Release with installers attached
```

**Key design decisions:**
- CI runs on every push AND pull request (catches errors early)
- Release runs on push to main only (not PRs)
- Version bumping is automatic — you never manually change version numbers
- The `[skip ci]` in the version bump commit prevents infinite loops
- Two separate jobs in release: bump runs on cheap `ubuntu-latest`, build runs on `windows-latest`

---

## Prerequisites

Your project must have these before the pipeline works:

| Requirement | Why |
|---|---|
| Tauri v2 project structure | `src-tauri/` with `tauri.conf.json`, `Cargo.toml` |
| `package.json` with `version` field | Keeps frontend version in sync |
| `tauri.conf.json` with `version` field | Source of truth for app version |
| `Cargo.toml` with `version` field | Keeps Rust crate version in sync |
| Bun as package manager | Used in workflows (swap for npm/pnpm if needed) |
| `bun run build` script that runs `tsc && vite build` | CI validates TypeScript + Vite |
| GitHub repo with Actions enabled | Obviously |

**No secrets needed** — `GITHUB_TOKEN` is automatically provided by GitHub Actions.

---

## Version Sync Strategy

Three files must always have the **same version**:

```
src-tauri/tauri.conf.json  →  "version": "0.1.9"     ← SOURCE OF TRUTH
package.json               →  "version": "0.1.9"
src-tauri/Cargo.toml       →  version = "0.1.9"
```

The release pipeline auto-bumps all three. You never edit these manually.

> **Note:** After the pipeline bumps the version and pushes, your local repo will be 1 commit behind. Run `git pull` before your next push to avoid merge conflicts.

---

## Pipeline 1: CI

**File:** `.github/workflows/ci.yml`

**Triggers:** Push to `main`, Pull requests to `main`

**Purpose:** Fast validation — catches TypeScript errors and Rust compilation issues before they reach release.

```yaml
name: CI

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  check:
    runs-on: windows-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install frontend dependencies
        run: bun install

      - name: Type check frontend
        run: bun run build

      - name: Check Rust
        working-directory: src-tauri
        run: cargo check
```

### What each step does

| Step | Purpose | Failure means |
|---|---|---|
| `actions/checkout@v4` | Clones the repo | (never fails) |
| `dtolnay/rust-toolchain@stable` | Installs latest stable Rust | (never fails) |
| `swatinem/rust-cache@v2` | Caches `target/` dir between runs — speeds up Rust builds from ~5min to ~30s | (never fails, just slower on miss) |
| `oven-sh/setup-bun@v2` | Installs Bun runtime | (never fails) |
| `bun install` | Installs node_modules | Dependency issue |
| `bun run build` | Runs `tsc && vite build` | TypeScript error or Vite config issue |
| `cargo check` | Validates Rust code compiles | Rust compilation error |

### Adapting CI for npm/pnpm

Replace the Bun steps:

```yaml
# For npm:
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: 'npm'

- name: Install frontend dependencies
  run: npm ci

- name: Type check frontend
  run: npm run build
```

```yaml
# For pnpm:
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: 22

- name: Setup pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 10

- name: Install frontend dependencies
  run: pnpm install --frozen-lockfile

- name: Type check frontend
  run: pnpm run build
```

---

## Pipeline 2: Release

**File:** `.github/workflows/release.yml`

**Triggers:** Push to `main`, Manual dispatch (workflow_dispatch)

**Purpose:** Auto-bump version, build installers, create GitHub Release.

```yaml
name: Release

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: write

jobs:
  # ─── Job 1: Version check + bump ──────────────────────────
  check-and-bump:
    runs-on: ubuntu-latest
    outputs:
      should_release: ${{ steps.bump.outputs.should_release }}
      version: ${{ steps.bump.outputs.version }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check for changes and bump version
        id: bump
        run: |
          # Get current version from tauri.conf.json
          CURRENT_VERSION=$(jq -r '.version' src-tauri/tauri.conf.json)
          echo "Current version: $CURRENT_VERSION"

          # Check if tag for current version exists
          if git tag -l "v$CURRENT_VERSION" | grep -q "v$CURRENT_VERSION"; then
            echo "Tag v$CURRENT_VERSION already exists"

            # Check if there are commits since the last tag
            COMMITS_SINCE=$(git rev-list "v$CURRENT_VERSION"..HEAD --count 2>/dev/null || echo "0")
            echo "Commits since v$CURRENT_VERSION: $COMMITS_SINCE"

            if [ "$COMMITS_SINCE" -eq "0" ]; then
              echo "No new commits since last release — skipping"
              echo "should_release=false" >> $GITHUB_OUTPUT
              echo "version=$CURRENT_VERSION" >> $GITHUB_OUTPUT
              exit 0
            fi

            # Auto-bump patch version
            IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
            NEW_PATCH=$((PATCH + 1))
            NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
            echo "Bumping version: $CURRENT_VERSION → $NEW_VERSION"

            # Update tauri.conf.json
            jq --arg v "$NEW_VERSION" '.version = $v' src-tauri/tauri.conf.json > tmp.json && mv tmp.json src-tauri/tauri.conf.json

            # Update package.json
            jq --arg v "$NEW_VERSION" '.version = $v' package.json > tmp.json && mv tmp.json package.json

            # Update Cargo.toml version
            sed -i "s/^version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml

            # Commit the version bump
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"
            git add src-tauri/tauri.conf.json package.json src-tauri/Cargo.toml
            git commit -m "chore: bump version to $NEW_VERSION [skip ci]"
            git push

            echo "should_release=true" >> $GITHUB_OUTPUT
            echo "version=$NEW_VERSION" >> $GITHUB_OUTPUT
          else
            echo "Tag v$CURRENT_VERSION does not exist — first release"
            echo "should_release=true" >> $GITHUB_OUTPUT
            echo "version=$CURRENT_VERSION" >> $GITHUB_OUTPUT
          fi

  # ─── Job 2: Build + Release ────────────────────────────────
  release:
    needs: check-and-bump
    if: needs.check-and-bump.outputs.should_release == 'true'
    runs-on: windows-latest

    steps:
      - name: Checkout repository (with bumped version)
        uses: actions/checkout@v4
        with:
          ref: main

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install frontend dependencies
        run: bun install

      - name: Build and Release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tauriScript: bun run tauri
          tagName: v__VERSION__
          releaseName: 'YourApp v__VERSION__'
          releaseBody: |
            ## YourApp v__VERSION__

            Description of your app.

            ### Installation
            - **`.msi`** — Standard Windows installer (recommended)
            - **`.exe`** — NSIS installer
          releaseDraft: false
          prerelease: false
```

---

## How the Auto-Version Bump Works

```
State: tauri.conf.json says "0.1.8"

Developer pushes code to main
  │
  ├── Does git tag "v0.1.8" exist?
  │     │
  │     ├── YES → Are there commits after v0.1.8?
  │     │          │
  │     │          ├── YES → Bump to 0.1.9
  │     │          │         Update 3 files
  │     │          │         Commit "[skip ci]"
  │     │          │         Push
  │     │          │         → Proceed to build
  │     │          │
  │     │          └── NO  → Skip release (nothing new)
  │     │
  │     └── NO  → First release!
  │               Use current 0.1.8 as-is
  │               → Proceed to build
  │
  └── Build job creates tag "v0.1.9" via tauri-action
```

### Why `[skip ci]`?

The version bump commit would trigger BOTH workflows again (since it's a push to main). The `[skip ci]` tag in the commit message tells GitHub Actions to ignore that commit. Without it, you'd get an infinite loop:

```
push → bump to 0.1.9 → push → bump to 0.1.10 → push → ...  (BAD!)
push → bump to 0.1.9 [skip ci] → ignored → build 0.1.9     (GOOD!)
```

### Why `fetch-depth: 0`?

The bump job needs full git history to:
1. List all tags (`git tag -l`)
2. Count commits since the last tag (`git rev-list`)

Default checkout only fetches 1 commit (shallow clone), which would break both operations.

---

## How the Release Bot Works

The `tauri-apps/tauri-action@v0` action does everything in one step:

```
1. Reads version from tauri.conf.json → "0.1.9"
2. Runs your build command → "bun run build" (vite + tsc)
3. Runs cargo build --release → compiles Rust binary
4. Bundles installers:
   ├── YourApp_0.1.9_x64_en-US.msi    (Windows Installer)
   └── YourApp_0.1.9_x64-setup.exe     (NSIS installer)
5. Creates git tag → v0.1.9
6. Creates GitHub Release "YourApp v0.1.9"
7. Uploads .msi and .exe as release assets
```

### Key `tauri-action` parameters

| Parameter | Value | Purpose |
|---|---|---|
| `tauriScript` | `bun run tauri` | How to invoke Tauri CLI (change for npm: `npx tauri`) |
| `tagName` | `v__VERSION__` | `__VERSION__` is replaced with the version from `tauri.conf.json` |
| `releaseName` | `'YourApp v__VERSION__'` | Display name on the GitHub Release page |
| `releaseBody` | Markdown string | Release notes (supports `__VERSION__` placeholder) |
| `releaseDraft` | `false` | Publish immediately (set `true` to review first) |
| `prerelease` | `false` | Mark as stable release |

---

## Setup Instructions

### Step 1: Create the workflow files

```
your-project/
  .github/
    workflows/
      ci.yml        ← copy from Pipeline 1 section above
      release.yml   ← copy from Pipeline 2 section above
```

### Step 2: Ensure version is consistent

All three files must have the same version:

```bash
# Check current versions
jq -r '.version' src-tauri/tauri.conf.json
jq -r '.version' package.json
grep '^version' src-tauri/Cargo.toml
```

If they differ, pick one and update the other two to match.

### Step 3: Set permissions

Go to your GitHub repo:
**Settings > Actions > General > Workflow permissions**

Select: **"Read and write permissions"**

This allows the release workflow to:
- Push version bump commits
- Create tags
- Create releases

### Step 4: First release

For the very first release, there's no existing tag, so the pipeline will use whatever version is currently in `tauri.conf.json`. Set it to your desired starting version (e.g., `0.1.0`).

```bash
git add .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: add CI and release pipelines"
git push origin main
```

The release workflow will:
1. See no tag exists for the current version
2. Build and create a GitHub Release
3. Tag it as `v0.1.0`

Every subsequent push to main will auto-bump: `0.1.0 → 0.1.1 → 0.1.2 → ...`

### Step 5: After each release, pull locally

```bash
git pull origin main
```

This fetches the version bump commit made by the bot. **Always pull before pushing** to avoid conflicts.

---

## Adapting for Your Project

### Change these values in `release.yml`

| What to change | Where | Example |
|---|---|---|
| App name in release title | `releaseName` | `'MyApp v__VERSION__'` |
| Release body content | `releaseBody` | Your app description, features, install instructions |
| Package manager | `tauriScript` | `npx tauri` (npm), `pnpm tauri` (pnpm), `bun run tauri` (bun) |

### Change these values in `ci.yml`

| What to change | Where | Example |
|---|---|---|
| Build runner OS | `runs-on` | `ubuntu-latest` for Linux, `macos-latest` for macOS |
| Package manager steps | Setup + install steps | See npm/pnpm examples in CI section |

### Tauri config requirements

Your `tauri.conf.json` must have:

```json
{
  "version": "0.1.0",
  "build": {
    "beforeBuildCommand": "bun run build",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": "all"
  }
}
```

The `bundle.active: true` and `bundle.targets: "all"` ensure installers are generated.

---

## Adapting for Multiple Platforms

To build for Windows + macOS + Linux, use a matrix strategy in the release job:

```yaml
  release:
    needs: check-and-bump
    if: needs.check-and-bump.outputs.should_release == 'true'
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: windows-latest
            args: ''
          - platform: macos-latest
            args: '--target aarch64-apple-darwin'
          - platform: macos-latest
            args: '--target x86_64-apple-darwin'
          - platform: ubuntu-22.04
            args: ''
    runs-on: ${{ matrix.platform }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: main

      # Linux only: install system dependencies
      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install frontend dependencies
        run: bun install

      - name: Build and Release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tauriScript: bun run tauri
          tagName: v__VERSION__
          releaseName: 'YourApp v__VERSION__'
          releaseBody: |
            ## YourApp v__VERSION__
            ### Downloads
            | Platform | File |
            |----------|------|
            | Windows | `.msi` / `.exe` |
            | macOS (Apple Silicon) | `.dmg` |
            | macOS (Intel) | `.dmg` |
            | Linux | `.deb` / `.AppImage` |
          args: ${{ matrix.args }}
          releaseDraft: false
          prerelease: false
```

All platform builds upload to the **same** GitHub Release (tauri-action handles this automatically).

---

## Troubleshooting

### "Permission denied" when pushing version bump

**Cause:** Workflow doesn't have write permissions.

**Fix:** In your repo, go to **Settings > Actions > General > Workflow permissions** and select **"Read and write permissions"**.

Also ensure `release.yml` has:
```yaml
permissions:
  contents: write
```

### Infinite release loop

**Cause:** The `[skip ci]` is missing from the version bump commit message.

**Fix:** Ensure the commit message includes `[skip ci]`:
```bash
git commit -m "chore: bump version to $NEW_VERSION [skip ci]"
```

### Release creates but no installers attached

**Cause:** The build step failed silently, or `bundle.active` is `false`.

**Fix:** Check that `tauri.conf.json` has:
```json
"bundle": {
  "active": true,
  "targets": "all"
}
```

### "Tag already exists" error

**Cause:** A tag was manually created that conflicts.

**Fix:** Delete the conflicting tag:
```bash
git tag -d v0.1.5
git push origin :refs/tags/v0.1.5
```

### Cargo.lock version out of sync

After the bot bumps `Cargo.toml`, the `Cargo.lock` won't update until the next `cargo build`. This is fine — the build step in the release job regenerates `Cargo.lock`. Locally, run `cargo check` after pulling to sync it.

### Release skipped unexpectedly

**Cause:** No new commits since the last tagged release.

Check with:
```bash
git log v0.1.8..HEAD --oneline
```

If this shows nothing, there's genuinely nothing new to release. Push a commit first.

---

## Quick Reference

```
File locations:
  .github/workflows/ci.yml       ← runs on every push + PR
  .github/workflows/release.yml  ← runs on push to main only

Version files (all must match):
  src-tauri/tauri.conf.json       ← source of truth
  package.json
  src-tauri/Cargo.toml

Release flow:
  push to main → auto-bump patch → build → tag → GitHub Release

Key actions used:
  actions/checkout@v4             ← clone repo
  dtolnay/rust-toolchain@stable   ← install Rust
  swatinem/rust-cache@v2          ← cache Rust builds
  oven-sh/setup-bun@v2            ← install Bun
  tauri-apps/tauri-action@v0      ← build + release

No secrets needed — GITHUB_TOKEN is automatic.
```
