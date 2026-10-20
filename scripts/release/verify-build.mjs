import { checkRelease } from './check-ai-assets.mjs';
const errors = await checkRelease(undefined, { verifyDist: true });
if (errors.length) throw new Error(errors.join('\n'));
console.log('Manual photo organization build verified; pretrained weights, inference Workers and runtimes excluded.');
