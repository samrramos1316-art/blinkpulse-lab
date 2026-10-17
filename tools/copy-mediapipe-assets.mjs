// Copies the MediaPipe wasm files from the pinned npm package into public/wasm so
// the app self-hosts them (PROJECT_SPEC 5.2: no network request after load).
// Runs before `npm run dev` and `npm run build`. The copies are git-ignored; the
// source of truth is the exact version in package.json.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const outDir = join(root, 'public', 'wasm');
mkdirSync(outDir, { recursive: true });

// FilesetResolver.forVisionTasks(base) loads vision_wasm_internal.{js,wasm}, or the
// _nosimd variant when WebAssembly SIMD is unavailable.
const files = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];
for (const f of files) copyFileSync(join(pkgDir, 'wasm', f), join(outDir, f));
console.log(`Copied ${files.length} MediaPipe wasm files (tasks-vision ${version}) to public/wasm`);
