import { rm } from 'node:fs/promises';
// Only generated application assets; never a user-media or database path.
await rm(new URL('../public/models/', import.meta.url), { recursive: true, force: true });
console.log('All pretrained model weights and AI runtimes excluded from product assets.');
