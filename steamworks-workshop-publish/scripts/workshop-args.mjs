// workshop-args.mjs: pure argument builders for steam-workshop.mjs. No Steam, no files, no process exit, so the tests in
// tests/steamworks import this file directly. Every optional input is left out of the result when it is not given, so a
// call without the new inputs is the same call as before they existed.

// WorkshopFileType in client.d.ts, by the names the skill accepts. The numbers follow the declaration order of the napi
// enum; tests/steamworks/workshop-args.test.mjs checks them against the generated client.d.ts.
export const FILE_TYPES = {
  community: 0,
  art: 1,
  screenshot: 2,
  video: 3,
  collection: 4,
  'web-guide': 5,
  'integrated-guide': 6,
};

// A YouTube video id: 11 characters from [A-Za-z0-9_-]. Steam takes Workshop videos only as YouTube ids, not URLs.
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// The arguments of workshop.createItem: `createItem(appId)` when no file type is given, as before.
export function createItemArgs(appId, fileTypeName) {
  if (fileTypeName === undefined) return [appId];
  if (!(fileTypeName in FILE_TYPES)) {
    throw new Error(`--file-type must be one of ${Object.keys(FILE_TYPES).join(', ')}`);
  }
  return [appId, FILE_TYPES[fileTypeName]];
}

// Splits a comma-separated list of YouTube ids. An absent list is empty; a value that is not an id is an error.
export function parseVideoIds(text) {
  if (text === undefined) return [];
  const ids = text.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = ids.filter((id) => !VIDEO_ID.test(id));
  if (bad.length > 0) throw new Error(`not a YouTube video id (11 characters, no URL): ${bad.join(', ')}`);
  return ids;
}

// The details of the primary-language update. Each optional input is added only when given, so an update without them is
// the same update as before. Videos are sent as additionalPreviewVideos (Steam keeps them as additional previews).
// metadata, keyValueTags and contentDescriptors take the UgcUpdate shapes of client.d.ts; the upload command does not
// take them yet, so only a caller that builds the update itself passes them.
export function primaryUpdate({
  title, description, language, changeNote, previewPath, contentPath, visibility, tags, videos,
  metadata, keyValueTags, contentDescriptors,
}) {
  return {
    title,
    description,
    language,
    changeNote,
    previewPath,
    contentPath,
    visibility,
    ...(tags === undefined ? {} : { tags }),
    ...(videos !== undefined && videos.length > 0 ? { additionalPreviewVideos: videos } : {}),
    ...(metadata === undefined ? {} : { metadata }),
    ...(keyValueTags === undefined ? {} : { keyValueTags }),
    ...(contentDescriptors === undefined ? {} : { contentDescriptors }),
  };
}

// The video ids that Steam does not list yet. Repeating an upload must not add the same video twice.
export function videosToSend(listed, onSteam) {
  const present = new Set(onSteam);
  return listed.filter((id) => !present.has(id));
}
