import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('apps/demo-lite');
const dist = resolve(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, 'server'), { recursive: true });
cpSync(resolve(root, 'worker.js'), resolve(dist, 'server/index.js'));