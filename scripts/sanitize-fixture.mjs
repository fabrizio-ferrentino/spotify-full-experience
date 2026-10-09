// Re-runs the fixture anonymizer and the safety scan on exported fixtures, so files
// exported with an older build pick up the current rules before being committed.
//
// Usage: node scripts/sanitize-fixture.mjs [--out <dir>] [--max-items <n>] [--redact <text>]... <fixture.json>...
//   --out        write sanitized files into <dir> (default: overwrite in place)
//   --max-items  keep only the first <n> items of every array (trims personal lists such as Liked Songs)
//   --redact     replace every occurrence of <text> with <redacted>, for personal IDs the generic
//                rules cannot recognise (e.g. the per-account Liked Songs playlist ID); repeatable
import * as esbuild from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadSharedModules() {
  const result = await esbuild.build({
    stdin: {
      contents:
        "export { anonymize, anonymizeString } from './src/shared/anonymize.ts';\n" +
        "export { findSensitivePatterns } from './src/shared/fixtureSafety.ts';\n",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function truncateArrays(value, max) {
  if (Array.isArray(value)) return value.slice(0, max).map((item) => truncateArrays(item, max));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, truncateArrays(child, max)]));
  }
  return value;
}

function redactText(value, needles) {
  if (typeof value === 'string') return needles.reduce((text, needle) => text.split(needle).join('<redacted>'), value);
  if (Array.isArray(value)) return value.map((item) => redactText(item, needles));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [redactText(key, needles), redactText(child, needles)]));
  }
  return value;
}

function parseArgs(argv) {
  const files = [];
  const redact = [];
  let out = null;
  let maxItems = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--max-items') maxItems = Number(argv[++i]);
    else if (argv[i] === '--redact') redact.push(argv[++i]);
    else files.push(argv[i]);
  }
  if (!files.length || (maxItems !== null && !(maxItems > 0))) {
    console.error('Usage: node scripts/sanitize-fixture.mjs [--out <dir>] [--max-items <n>] [--redact <text>]... <fixture.json>...');
    process.exit(2);
  }
  if (redact.some((needle) => !needle)) {
    console.error('--redact needs a non-empty value');
    process.exit(2);
  }
  return { files, out, maxItems, redact };
}

const { files, out, maxItems, redact } = parseArgs(process.argv.slice(2));
const { anonymize, anonymizeString, findSensitivePatterns } = await loadSharedModules();
let failed = false;

for (const file of files) {
  const fixture = redactText(JSON.parse(await readFile(file, 'utf8')), redact);
  if (fixture.format !== 'sfe-fixture/v1') {
    console.error(`${file}: not an sfe-fixture/v1 file, skipped`);
    failed = true;
    continue;
  }
  const trim = (value) => (maxItems ? truncateArrays(value, maxItems) : value);
  fixture.request.endpoint = anonymizeString(fixture.request.endpoint);
  fixture.request.variables = anonymize(fixture.request.variables);
  fixture.response.json = anonymize(trim(fixture.response.json));

  const text = `${JSON.stringify(fixture, null, 2)}\n`;
  const problems = findSensitivePatterns(text);
  if (problems.length) {
    console.error(`${file}: still contains ${problems.join(', ')}; not written`);
    failed = true;
    continue;
  }
  const target = out ? path.join(out, path.basename(file)) : file;
  if (out) await mkdir(out, { recursive: true });
  await writeFile(target, text);
  console.log(`${file} -> ${target}`);
}

process.exit(failed ? 1 : 0);
