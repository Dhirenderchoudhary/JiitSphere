const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = process.cwd();
const nextDir = path.join(projectRoot, '.next');
const webpackCacheDir = path.join(nextDir, 'cache', 'webpack');
const skip = String(process.env.SKIP_NEXT_CACHE_CLEAR || '').trim().toLowerCase();
const mode = String(process.env.NEXT_RUNTIME_PREP_MODE || '').trim().toLowerCase();

if (['1', 'true', 'yes', 'on'].includes(skip)) {
  process.exit(0);
}

// Cleanup is intentionally limited to build/start to avoid races with next dev cache IO.
if (!['build', 'start'].includes(mode)) {
  process.exit(0);
}

if (!fs.existsSync(webpackCacheDir)) {
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(os.tmpdir(), `jiit-next-webpack-cache-${stamp}-${process.pid}`);

try {
  fs.mkdirSync(path.dirname(backupDir), { recursive: true });
  fs.renameSync(webpackCacheDir, backupDir);
  process.stdout.write(`[prepare-next-runtime] moved stale webpack cache to ${backupDir}\n`);
} catch (_error) {
  try {
    fs.rmSync(webpackCacheDir, { recursive: true, force: true });
    process.stdout.write('[prepare-next-runtime] cleared stale webpack cache\n');
  } catch (cleanupError) {
    process.stderr.write(`[prepare-next-runtime] unable to clean webpack cache: ${cleanupError.message}\n`);
    process.exit(1);
  }
}
