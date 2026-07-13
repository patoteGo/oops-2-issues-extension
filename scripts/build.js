#!/usr/bin/env node
/*
 * Builds the BugSnap extension into ./dist — a clean folder containing ONLY
 * the runtime files needed to load the extension unpacked in Chrome.
 *
 *   node scripts/build.js           # one-shot build
 *   node scripts/build.js --watch   # rebuild on any source change
 *
 * Output (gitignored): dist/ with manifest.json, background.js, content.js,
 * selector.js, selector.css, lib/, sidepanel/, icons/.
 *
 * Dev-only files are excluded: __tests__/, scripts/, package.json,
 * vitest.config.ts, README.md, node_modules/, the .zip, etc.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

// Runtime files/dirs (relative to ROOT) copied verbatim into dist/.
const COPY = [
  'manifest.json',
  'background.js',
  'content.js',
  'selector.js',
  'selector.css',
  'lib',
  'sidepanel',
  'icons',
]

// Dirs to never copy into dist, even when nested inside a copied dir.
const SKIP_DIRS = new Set(['__tests__'])

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true })
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else copyFile(s, d)
  }
}

function build() {
  rmrf(DIST)
  fs.mkdirSync(DIST, { recursive: true })
  for (const item of COPY) {
    const src = path.join(ROOT, item)
    if (!fs.existsSync(src)) {
      console.warn(`  ! skipping missing: ${item}`)
      continue
    }
    const dest = path.join(DIST, item)
    if (fs.statSync(src).isDirectory()) copyDir(src, dest)
    else copyFile(src, dest)
  }
  console.log(`✓ Built BugSnap into dist/ (${COPY.length} entries)`)
}

function watch() {
  build()
  let timer
  const rebuild = () => {
    clearTimeout(timer)
    timer = setTimeout(build, 150) // debounce bursts of saves
  }
  for (const item of COPY) {
    const src = path.join(ROOT, item)
    if (!fs.existsSync(src)) continue
    try {
      // recursive:true is supported on macOS/Windows; watches file trees.
      // We never watch dist/, so builds never trigger themselves.
      fs.watch(src, { recursive: true }, rebuild)
    } catch {
      /* platform/directory unsupported — skip silently */
    }
  }
  console.log('Watching source for changes… (Ctrl+C to stop)')
}

if (process.argv.includes('--watch')) watch()
else build()
