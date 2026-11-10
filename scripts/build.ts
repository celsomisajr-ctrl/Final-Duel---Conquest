// Builds the client into dist/ with Bun's bundler:  bun scripts/build.ts
import fs from 'node:fs';
const out = 'dist';
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const r = await Bun.build({ entrypoints: ['src/main.ts'], outdir: out, naming: 'app.js', minify: true, target: 'browser', format: 'esm' });
if (!r.success) { for (const l of r.logs) console.error(l); process.exit(1); }
fs.copyFileSync('index.html', out + '/index.html'); fs.copyFileSync('src/ui/app.css', out + '/app.css');
if (fs.existsSync('public')) fs.cpSync('public', out, { recursive: true });
console.log('built', out, (fs.statSync(out + '/app.js').size / 1024).toFixed(0) + ' KB');
export {};
