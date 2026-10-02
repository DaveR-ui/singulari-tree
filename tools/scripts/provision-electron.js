#!/usr/bin/env node
'use strict';

/**
 * Provisions the Electron binary for this repository.
 *
 * Electron's own postinstall (`node_modules/electron/install.js`) extracts the
 * downloaded archive with `extract-zip` -> `yauzl`. On Node v26 that extraction
 * silently exits with code 0 on the first non-trivial compressed entry, leaving
 * `node_modules/electron/dist/` incomplete (only `locales/`) and `path.txt`
 * missing, so the `electron` binary never works.
 *
 * This script replaces that broken extraction step without re-downloading:
 *   1. Resolve the already checksum-verified archive from the @electron/get
 *      cache (reusing the cached zip; no network when it is present).
 *   2. Extract it with the system `unzip`.
 *   3. Repair the executable mode and write `path.txt`.
 *
 * It is idempotent: when the install already looks correct (mirroring
 * Electron's own `isInstalled()` check) it exits immediately with code 0.
 * It never invokes `npm install` and never re-downloads.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ELECTRON_DIR = path.join(REPO_ROOT, 'node_modules', 'electron');

function fail(message) {
  console.error(`[provision-electron] ${message}`);
  process.exit(1);
}

function getPlatformPath(platform) {
  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`);
  }
}

/**
 * Extracts the archive into `distDir` using whichever extractor is available
 * on the host. Electron's own extractor (`extract-zip` -> `yauzl@2`) is
 * unusable on Node >=26, so we prefer OS tooling and fall back across
 * platforms:
 *   - `unzip`      : Linux CI/images (and Git Bash on Windows)
 *   - `bsdtar`     : bundled with Windows 10+ and macOS (`tar -xf` handles zip)
 *   - `tar`        : last-resort alias for bsdtar/libarchive
 * A missing extractor is a hard failure (never a silent success).
 */
function extractArchive(zipPath, distDir) {
  const attempts = [
    { cmd: 'unzip', args: ['-oq', zipPath, '-d', distDir] },
    { cmd: 'bsdtar', args: ['-xf', zipPath, '-C', distDir] },
    // Windows' bsdtar is exposed as `tar`; GNU tar cannot read zip, hence last.
    { cmd: 'tar', args: ['-xf', zipPath, '-C', distDir] },
  ];

  const errors = [];
  for (const { cmd, args } of attempts) {
    try {
      execFileSync(cmd, args, { stdio: 'inherit' });
      return;
    } catch (error) {
      // ENOENT means the tool is absent; any other error means it ran and
      // failed (e.g. GNU tar rejecting a zip). Try the next extractor.
      errors.push(`${cmd}: ${error.code === 'ENOENT' ? 'not found' : error.message}`);
    }
  }

  fail(
    `Failed to extract ${zipPath}. Install one of 'unzip' or 'bsdtar' ` +
      `(libarchive) on PATH. Attempts: ${errors.join(' | ')}`
  );
}

/**
 * Mirrors Electron's install.js `isInstalled()`: a cheap, side-effect free
 * check used to keep this provisioner idempotent and fast on re-runs.
 */
function isInstalled({ version, platformPath, electronBinary, versionFile, pathFile }) {
  try {
    if (fs.readFileSync(versionFile, 'utf-8').trim().replace(/^v/, '') !== version) {
      return false;
    }
    if (fs.readFileSync(pathFile, 'utf-8') !== platformPath) {
      return false;
    }
  } catch {
    return false;
  }

  return fs.existsSync(electronBinary);
}

async function main() {
  // Mirror Electron's install.js: honor the explicit opt-out.
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    console.log('[provision-electron] ELECTRON_SKIP_BINARY_DOWNLOAD set; skipping provisioning.');
    return;
  }

  if (!fs.existsSync(path.join(ELECTRON_DIR, 'package.json'))) {
    fail(`Electron package not found at ${ELECTRON_DIR}. Run npm install first.`);
  }

  // eslint-disable-next-line global-require
  const { version } = require(path.join(ELECTRON_DIR, 'package.json'));
  // eslint-disable-next-line global-require
  const checksums = require(path.join(ELECTRON_DIR, 'checksums.json'));

  const platform = process.env.npm_config_platform || process.platform;
  const arch = process.env.npm_config_arch || process.arch;
  const platformPath = getPlatformPath(platform);

  const distDir = process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(ELECTRON_DIR, 'dist');
  const electronBinary = path.join(distDir, platformPath);
  const versionFile = path.join(distDir, 'version');
  const pathFile = path.join(ELECTRON_DIR, 'path.txt');

  if (isInstalled({ version, platformPath, electronBinary, versionFile, pathFile })) {
    console.log(`[provision-electron] Electron ${version} already provisioned; nothing to do.`);
    return;
  }

  let downloadArtifact;
  try {
    // Resolve @electron/get through Electron's own install location, not the
    // hoisted root: npm hoisting is an implementation detail and Electron may
    // nest the dependency in a future release.
    const getEntry = require.resolve('@electron/get', { paths: [ELECTRON_DIR] });
    ({ downloadArtifact } = require(getEntry));
  } catch (error) {
    fail(`Cannot load @electron/get: ${error.message}`);
  }

  let zipPath;
  try {
    // Resolves the cached, checksum-verified archive. No network when cached.
    zipPath = await downloadArtifact({
      version,
      artifactName: 'electron',
      cacheRoot: process.env.electron_config_cache,
      checksums,
      platform,
      arch,
    });
  } catch (error) {
    fail(`Failed to resolve the Electron archive: ${error.message}`);
  }

  console.log(`[provision-electron] Using cached archive: ${zipPath}`);

  try {
    fs.mkdirSync(distDir, { recursive: true });
  } catch (error) {
    fail(`Cannot create ${distDir}: ${error.message}`);
  }

  extractArchive(zipPath, distDir);

  // The bug this script exists to work around is a SILENT PARTIAL extraction,
  // so never trust a zero exit code: assert the artifact is actually complete
  // before declaring success or writing path.txt.
  try {
    const extracted = fs.readFileSync(versionFile, 'utf-8').trim().replace(/^v/, '');
    if (extracted !== version) {
      fail(
        `Extraction incomplete: ${versionFile} reports "${extracted}", expected "${version}".`
      );
    }
  } catch (error) {
    fail(`Extraction incomplete: ${versionFile} is missing or unreadable (${error.message}).`);
  }
  if (!fs.existsSync(electronBinary)) {
    fail(`Extraction incomplete: ${electronBinary} was not produced.`);
  }

  // If the archive ships type definitions, move them up (mirror install.js).
  const srcTypeDefPath = path.join(distDir, 'electron.d.ts');
  if (fs.existsSync(srcTypeDefPath)) {
    fs.renameSync(srcTypeDefPath, path.join(ELECTRON_DIR, 'electron.d.ts'));
  }

  try {
    // Only the main executable is made runnable; other modes are left as-is.
    fs.chmodSync(electronBinary, 0o755);
  } catch (error) {
    fail(`Cannot mark ${electronBinary} executable: ${error.message}`);
  }

  try {
    // Exactly `electron`, with no trailing newline.
    fs.writeFileSync(pathFile, platformPath);
  } catch (error) {
    fail(`Cannot write ${pathFile}: ${error.message}`);
  }

  console.log(`[provision-electron] Electron ${version} provisioned at ${electronBinary}.`);
}

main().catch((error) => {
  fail(error && error.stack ? error.stack : String(error));
});
