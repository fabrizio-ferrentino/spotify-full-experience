// Builds the extension for each browser target into dist/<target>/.
// Usage: node scripts/build.mjs [--dev] [--watch]
import * as esbuild from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const dev = watch || args.has('--dev');

const TARGETS = {
  chrome: ['chrome120'],
  firefox: ['firefox128'],
};

const ENTRY_POINTS = {
  bootstrap: 'src/bootstrap/index.ts',
  page: 'src/page/index.ts',
  options: 'src/options/options.ts',
};

const STATIC_FILES = ['src/options/options.html', 'src/options/options.css'];

const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Objects merge recursively; arrays and scalars from the override replace the base.
function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

async function writeManifest(target, outdir) {
  const pkg = await readJson('package.json');
  const base = await readJson('manifest/base.json');
  const override = await readJson(`manifest/${target}.json`);
  const manifest = { ...deepMerge(base, override), version: pkg.version };
  await writeFile(path.join(outdir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function copyStatic(outdir) {
  await Promise.all(STATIC_FILES.map((file) => copyFile(path.join(root, file), path.join(outdir, path.basename(file)))));
}

async function buildTarget(target) {
  const outdir = path.join(root, 'dist', target);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await writeManifest(target, outdir);
  await copyStatic(outdir);

  const options = {
    absWorkingDir: root,
    entryPoints: ENTRY_POINTS,
    outdir,
    bundle: true,
    format: 'iife',
    target: TARGETS[target],
    sourcemap: dev ? 'inline' : false,
    minify: false,
    legalComments: 'none',
    logLevel: 'info',
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    return;
  }
  await esbuild.build(options);
}

for (const target of Object.keys(TARGETS)) {
  await buildTarget(target);
}
if (watch) console.log('Watching for changes (manifest and static files are copied only at start)...');
