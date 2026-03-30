import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const target = process.argv[2];
const validTargets = new Set(['chrome', 'firefox']);

if (!target || !validTargets.has(target)) {
  console.error('Usage: node scripts/apply-manifest.mjs <chrome|firefox>');
  process.exit(1);
}

const manifestSource = join(root, 'manifests', `manifest.${target}.json`);
const outputDir = join(root, 'dist', target);
const manifestDestination = join(outputDir, 'manifest.json');

if (!existsSync(manifestSource)) {
  console.error(`Missing manifest source: ${manifestSource}`);
  process.exit(1);
}

if (!existsSync(outputDir)) {
  console.error(`Missing build output directory: ${outputDir}`);
  process.exit(1);
}

copyFileSync(manifestSource, manifestDestination);
console.log(`Applied ${target} manifest -> ${manifestDestination}`);