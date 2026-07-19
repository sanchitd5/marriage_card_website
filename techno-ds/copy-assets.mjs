// Copy the stylesheet + vendored fonts into dist/ after tsup builds the JS/d.ts.
// design-sync's cfg.cssEntry points at dist/styles.css; its @font-face url()s
// resolve to dist/fonts/*.woff2.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, 'dist', 'fonts'), { recursive: true });
cpSync(join(root, 'src', 'styles.css'), join(root, 'dist', 'styles.css'));
cpSync(join(root, 'src', 'fonts'), join(root, 'dist', 'fonts'), { recursive: true });
console.log('copy-assets: styles.css + fonts/ -> dist/');
