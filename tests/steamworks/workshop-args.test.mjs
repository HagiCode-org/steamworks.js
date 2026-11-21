import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARGS = pathToFileURL(path.join(ROOT, 'steamworks-workshop-publish', 'scripts', 'workshop-args.mjs')).href;
const { createItemArgs, parseVideoIds, primaryUpdate, videosToSend, FILE_TYPES } = await import(ARGS);

test('createItem without a file type is called exactly as before: appId only', () => {
  assert.deepEqual(createItemArgs(4348910), [4348910]);
  assert.deepEqual(createItemArgs(4348910, undefined), [4348910]);
});

test('a named file type is passed as its number, and an unknown one is refused', () => {
  assert.deepEqual(createItemArgs(4348910, 'art'), [4348910, FILE_TYPES.art]);
  assert.equal(FILE_TYPES.community, 0);
  assert.throws(() => createItemArgs(4348910, 'banana'), /--file-type must be one of community, art/);
});

test('video ids: a valid id passes, a URL, a short id and illegal characters are refused', () => {
  assert.deepEqual(parseVideoIds(undefined), []);
  assert.deepEqual(parseVideoIds('dQw4w9WgXcQ, a-b_C9z-0_Q'), ['dQw4w9WgXcQ', 'a-b_C9z-0_Q']);
  assert.throws(() => parseVideoIds('https://youtu.be/dQw4w9WgXcQ'), /not a YouTube video id/);
  assert.throws(() => parseVideoIds('dQw4w9WgXc'), /dQw4w9WgXc/);
  assert.throws(() => parseVideoIds('dQw4w9WgX/Q'), /not a YouTube video id/);
});

test('the primary update without tags or videos is the same object as before the inputs existed', () => {
  const before = {
    title: 'My mod', description: '[h1]My mod[/h1]', language: 'english', changeNote: 'note',
    previewPath: '/p/preview.png', contentPath: '/p/build', visibility: 0,
  };
  assert.deepStrictEqual(primaryUpdate({ ...before }), before);
  assert.deepStrictEqual(primaryUpdate({ ...before, videos: [] }), before, 'an empty video list adds nothing');
});

test('tags and videos are added to the primary update only when given', () => {
  const base = { title: 't', description: 'd', language: 'english', changeNote: 'n', previewPath: 'p', contentPath: 'c', visibility: 2 };
  assert.deepStrictEqual(primaryUpdate({ ...base, tags: [] }).tags, [], 'an empty tag list still clears the tags');
  const withVideos = primaryUpdate({ ...base, videos: ['dQw4w9WgXcQ'] });
  assert.deepStrictEqual(withVideos.additionalPreviewVideos, ['dQw4w9WgXcQ']);
  assert.equal('tags' in withVideos, false);
});

test('metadata, key-value tags and content descriptors are added only when given', () => {
  const base = { title: 't', description: 'd', language: 'english', changeNote: 'n', previewPath: 'p', contentPath: 'c', visibility: 2 };
  assert.deepStrictEqual(primaryUpdate({ ...base }), primaryUpdate({ ...base, metadata: undefined, keyValueTags: undefined, contentDescriptors: undefined }));
  assert.equal('metadata' in primaryUpdate({ ...base }), false);
  const full = primaryUpdate({
    ...base,
    metadata: 'v2',
    keyValueTags: { clear: true, remove: ['mode'], add: [{ key: 'mode', value: 'hard' }] },
    contentDescriptors: { add: [5] },
  });
  assert.equal(full.metadata, 'v2');
  assert.deepStrictEqual(full.keyValueTags, { clear: true, remove: ['mode'], add: [{ key: 'mode', value: 'hard' }] });
  assert.deepStrictEqual(full.contentDescriptors, { add: [5] });
});

test('the file type numbers match WorkshopFileType in the generated client.d.ts', () => {
  const dts = readFileSync(path.join(ROOT, 'client.d.ts'), 'utf8');
  const block = /enum WorkshopFileType \{([^}]*)\}/.exec(dts);
  assert.ok(block, 'client.d.ts declares WorkshopFileType');
  const declared = {};
  for (const [, name, value] of block[1].matchAll(/(\w+)\s*=\s*(\d+)/g)) {
    declared[name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()] = Number(value);
  }
  assert.deepEqual(FILE_TYPES, declared);
});

test('a re-upload sends only the videos Steam does not already list', () => {
  assert.deepEqual(videosToSend(['a', 'b', 'c'], ['b']), ['a', 'c']);
  assert.deepEqual(videosToSend(['a'], ['a']), []);
  assert.deepEqual(videosToSend(['a'], []), ['a']);
});
