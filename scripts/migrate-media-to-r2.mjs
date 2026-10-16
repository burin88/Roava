import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { getR2StorageService } from '../server/services/r2-storage.service.mjs';
import { MediaStorageService } from '../server/services/media-storage.service.mjs';

// Explicit migration preserves IDs used by trip/place/expense references and retains originals.
const directory = resolve(import.meta.dirname, '../img/travel-photos');
let index;
try { index = JSON.parse(await readFile(join(directory, 'media-index.json'), 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.log('No local media index to migrate.');
  process.exit(0);
}
const media = new MediaStorageService(getR2StorageService());
let count = 0;
for (const record of Object.values(index)) {
  if (await media.getRecord(record.id)) continue;
  if (!record.storedFileName || basename(record.storedFileName) !== record.storedFileName) throw new Error('Invalid local media path');
  const bytes = await readFile(join(directory, record.storedFileName));
  await media.save(bytes, record, record.id);
  count++;
}
console.log(`Migrated ${count} photos to R2. IDs preserved; local originals retained.`);
