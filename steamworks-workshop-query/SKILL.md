---
name: steamworks-workshop-query
description: "Read-only Steam Workshop/UGC queries with steamworks.js: remote item lists, search, tag filtering, single and batch item details, a user's published items, and paging. Use for Workshop 列表 / 搜索 / 标签筛选 / 项目详情 / 用户作品 / 分页 / getAllItems / getUserItems / getItem / getItems questions. Requires the steamworks-js setup first."
---

# steamworks-workshop-query

Read-only. Nothing here changes the account, the Workshop, or local files. Complete the setup in [`steamworks-js`](../steamworks-js/SKILL.md) first.

## Calls (from the installed typings)

- `workshop.getItem(publishedFileId, config?)`: one item, or `null`.
- `workshop.getItems(ids[], config?)`: a batch of ids; returns `items` and `wasCached`.
- `workshop.getAllItems(page, queryType, itemType, creatorAppId, consumerAppId, config?)`: the general query. `queryType` and `itemType` are the `UGCQueryType` and `UGCType` const enums.
- `workshop.getUserItems(page, accountId, listType, itemType, sortOrder, appIds, config?)`: items for one user. `appIds` takes `{ creator?, consumer? }`.

## Query config

Useful fields on `WorkshopItemQueryConfig`: `requiredTags`, `excludedTags`, `matchAnyTag`, `searchText`, `rankedByTrendDays`, `language`, `includeMetadata`, `includeLongDescription`, `includeAdditionalPreviews`, `onlyIds`, `onlyTotal`, `cachedResponseMaxAge`, `returnChildren`.

- Use `onlyTotal` or `onlyIds` when you only need counts or ids; they are cheaper.
- Paginated results carry `returnedResults`, `totalResults` and `wasCached`. Loop pages until the collected count reaches `totalResults` or a page returns no items.

## Steps

1. Confirm the AppID (`creatorAppId` / `consumerAppId`) with the user. Results for the wrong AppID look valid but are for another game.
2. Start with `onlyTotal` to size the result. Then page through with a fixed page size.
3. Treat `undefined` or `null` entries in `items` as missing, not as errors to hide. Report how many were missing.
4. Report the query used (AppID, filters, page range) next to the results, so the list can be reproduced.

## Limits to confirm

Steam documents a per-page maximum (the plan states 50). Confirm this against the Steamworks documentation or a live query before relying on it. The first page index is also unconfirmed here; check the typings' doc comments before paging.
