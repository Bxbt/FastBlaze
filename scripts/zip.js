#!/usr/bin/env node
// Builds dist/fastblaze-<version>.zip with only the files the extension needs
// (manifest.json, icons/, src/) and checks every file the manifest / pages reference.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;
const out = path.join(root, 'dist', `fastblaze-${version}.zip`);

// 1. Every file referenced by the manifest must exist.
const refs = new Set([
  manifest.background && manifest.background.service_worker,
  manifest.action && manifest.action.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {}),
  ...(manifest.content_scripts || []).flatMap((c) => c.js || []),
].filter(Boolean));

// 2. Scripts / styles referenced by the HTML pages and importScripts() in the worker.
for (const page of [manifest.action.default_popup, manifest.options_page]) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css|png))"/g)) refs.add(path.normalize(path.join(path.dirname(page), m[1])));
}
const worker = manifest.background.service_worker;
const workerSrc = fs.readFileSync(path.join(root, worker), 'utf8');
for (const m of workerSrc.matchAll(/importScripts\(([^)]*)\)/g)) {
  for (const f of m[1].matchAll(/'([^']+)'/g)) refs.add(path.normalize(path.join(path.dirname(worker), f[1])));
}

const missing = [...refs].filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  console.error('Missing files referenced by the extension:\n  ' + missing.join('\n  '));
  process.exit(1);
}

// 3. Zip manifest + icons + src (no tests, test pages, scripts or dot files).
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) fs.unlinkSync(out);
execFileSync('zip', ['-r', '-q', '-X', out, 'manifest.json', 'icons', 'src', '-x', '*.DS_Store', '-x', 'icons/icon-512.png'], { cwd: root, stdio: 'inherit' });

const size = fs.statSync(out).size;
console.log(`Built ${path.relative(root, out)} (${(size / 1024).toFixed(1)} KB, ${refs.size} referenced files checked)`);
