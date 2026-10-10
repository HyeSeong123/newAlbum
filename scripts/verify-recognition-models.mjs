import { existsSync, readdirSync } from 'node:fs';
// There is no approved 512-D or pet-side pose weight set in release 0.9.4.
// Fail packaging if weights are slipped into these reserved asset roots.
for(const directory of ['public/models/people512','public/models/pet-pose']) {
 if(existsSync(directory)&&readdirSync(directory).length)throw new Error(`Unapproved commercial model weights: ${directory}. Verify code, weights and training-data rights before changing the reviewed registry.`);
}
