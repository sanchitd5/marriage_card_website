import { defineConfig } from 'tsup';

// Build the techno design system to dist/ as ESM + CJS + .d.ts. The stylesheet
// and fonts are copied verbatim by copy-assets.mjs (run after tsup via the
// build script) — design-sync reads dist/index.mjs as the bundle entry and
// dist/styles.css as cfg.cssEntry.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
});
