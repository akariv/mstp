import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external', // runtime deps come from functions/package.json; @shared is inlined via tsconfig paths
  tsconfig: 'tsconfig.json',
  sourcemap: 'linked',
  logLevel: 'info',
});
