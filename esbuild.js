// @ts-check
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const problemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    const label = build.initialOptions.outfile ?? 'build';
    build.onStart(() => {
      console.log(`[watch] ${label} build started`);
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log(`[watch] ${label} build finished`);
    });
  }
};

/** @type {import('esbuild').BuildOptions} */
const sharedOptions = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: 'warning',
  plugins: [problemMatcherPlugin]
};

/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
  ...sharedOptions,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  external: ['vscode']
};

/** @type {import('esbuild').BuildOptions} */
const hookOptions = {
  ...sharedOptions,
  entryPoints: ['src/hook/index.ts'],
  outfile: 'dist/supernotify-hook.js',
  banner: { js: '#!/usr/bin/env node' }
};

async function main() {
  const contexts = await Promise.all([esbuild.context(extensionOptions), esbuild.context(hookOptions)]);

  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    return;
  }

  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
