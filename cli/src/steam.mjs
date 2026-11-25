// The only module that loads the steamworks.js native binding and calls Steam. Commands receive it as `steam` and tests
// replace it with a fake that has the same `connect` shape, so no test needs Steam.
//
// The binding folder is STEAMWORKS_JS when set (a folder with index.js), otherwise the @hagicode/steamworks.js package
// this CLI depends on. Nothing is read from a fixed path. Locating the binding reads only its package.json; the native
// module is loaded by connect(), after the version check, so --help, check, pack and every dry run never load it.
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CommandError } from './errors.mjs'
import { VISIBILITY } from './item.mjs'

export const DEPENDENCY = '@hagicode/steamworks.js'
export const BINDING_ENV = 'STEAMWORKS_JS'
const require = createRequire(import.meta.url)
const PREVIEW_TYPES = ['image', 'youtube', 'sketchfab', 'environment-horizontal-cross', 'environment-latlong', 'clip']
// Numeric values of the const enums in client.d.ts (the declaration order of the napi enums).
const UGC_QUERY_TYPE_RANKED_BY_PUBLICATION_DATE = 1
const UGC_QUERY_TYPE_RANKED_BY_TEXT_SEARCH = 11
const UGC_TYPE_ITEMS = 0
const USER_LIST_TYPE_PUBLISHED = 0
const USER_LIST_ORDER_CREATION_ORDER_DESC = 1
const VISIBILITY_NAMES = Object.fromEntries(Object.entries(VISIBILITY).map(([name, value]) => [value, name]))

export const itemUrl = (id) => `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`

// "0.1.5", "0.3.1-dev.5" -> [0, 1, 5]; anything without a x.y.z start is null.
export function parseVersion(text) {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(text))
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function versionAtLeast(actual, minimum) {
    const a = parseVersion(actual)
    const m = parseVersion(minimum)
    if (!a || !m) return false
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== m[i]) return a[i] > m[i]
    }
    return true
}

// Refuses a feature the installed binding lacks. Called before any Steam call, so nothing is sent.
export function requireVersion(actual, minimum, feature) {
    if (!versionAtLeast(actual, minimum)) {
        throw new CommandError(`steamworks.js ${actual} cannot ${feature}; install ${DEPENDENCY}@${minimum} or later (nothing was sent)`)
    }
}

export function locateBinding(env = process.env) {
    let folder
    if (env[BINDING_ENV]) {
        folder = path.resolve(env[BINDING_ENV])
        if (!existsSync(path.join(folder, 'index.js'))) {
            throw new CommandError(`${BINDING_ENV} points to ${folder}, which has no index.js. Set it to the ${DEPENDENCY} package folder, or unset it to use the dependency.`)
        }
    } else {
        try {
            folder = path.dirname(require.resolve(`${DEPENDENCY}/package.json`))
        } catch {
            throw new CommandError(`the steamworks.js binding is not installed: ${DEPENDENCY} (the CLI dependency) cannot be found. Reinstall the CLI, or set ${BINDING_ENV} to the ${DEPENDENCY} package folder that contains index.js.`)
        }
    }
    let version
    try {
        version = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')).version
    } catch (error) {
        throw new CommandError(`cannot read the version of the steamworks.js binding in ${folder}: ${error.message}`)
    }
    return { folder, version }
}

// Locates and loads the native binding (the only place the module is required). Returns { binding, folder, version }.
export function loadBinding(env = process.env) {
    const located = locateBinding(env)
    try {
        return { ...located, binding: require(located.folder) }
    } catch (error) {
        throw new CommandError(`cannot load the steamworks.js binding from ${located.folder}: ${error.message}`)
    }
}

export function normalizeItem(info) {
    return {
        publishedFileId: String(info.publishedFileId),
        title: info.title,
        owner: info.owner?.steamId64 === undefined ? null : String(info.owner.steamId64),
        consumerAppId: info.consumerAppId ?? null,
        creatorAppId: info.creatorAppId ?? null,
        visibility: VISIBILITY_NAMES[info.visibility] ?? info.visibility,
        tags: info.tags ?? [],
        previewUrl: info.previewUrl ?? null,
        timeUpdated: info.timeUpdated ?? null,
        url: itemUrl(info.publishedFileId),
        additionalPreviews: (info.additionalPreviews ?? []).map((p) => ({
            originalFilename: p.originalFilename,
            urlOrVideoId: p.urlOrVideoId,
            previewType: PREVIEW_TYPES[p.previewType] ?? p.previewType,
        })),
    }
}

// Wraps the live client. Every method returns plain data, so commands never see binding objects.
class SteamSession {
    constructor(client, binding) {
        this.client = client
        this.binding = binding
    }

    whoami() {
        const id = this.client.localplayer.getSteamId()
        return { steamId64: String(id.steamId64), accountId: id.accountId, name: this.client.localplayer.getName() }
    }

    ownsApp(appId) {
        return this.client.apps?.isSubscribedApp ? this.client.apps.isSubscribedApp(appId) : true
    }

    async getItem(id) {
        const info = await this.client.workshop.getItem(BigInt(id), { includeAdditionalPreviews: true, cachedResponseMaxAge: 0 })
        return info ? normalizeItem(info) : null
    }

    async createItem(appId) {
        const created = await this.client.workshop.createItem(appId)
        if (!created.itemId || created.itemId === 0n) throw new CommandError('Steam did not create the item')
        return { itemId: String(created.itemId), agreement: Boolean(created.needsToAcceptAgreement) }
    }

    // One update submission. Resolves with whether Steam asks for the Workshop agreement to be accepted.
    submit(id, details, { appId, onProgress } = {}) {
        return new Promise((resolve, reject) => {
            this.client.workshop.updateItemWithCallback(
                BigInt(id),
                details,
                appId,
                (data) => resolve({ agreement: Boolean(data?.needsToAcceptAgreement) }),
                (err) => reject(new CommandError(`Steam rejected the update of item ${id}: ${err?.message ?? err}`)),
                onProgress,
                200,
            )
        })
    }

    async queryItems({ appId, page, mine = false, search, tag }) {
        const config = { cachedResponseMaxAge: 0, ...(search ? { searchText: search } : {}), ...(tag ? { requiredTags: [tag] } : {}) }
        const result = mine
            ? await this.client.workshop.getUserItems(page, this.whoami().accountId, USER_LIST_TYPE_PUBLISHED, UGC_TYPE_ITEMS,
                USER_LIST_ORDER_CREATION_ORDER_DESC, { creator: appId, consumer: appId }, config)
            : await this.client.workshop.getAllItems(page,
                search ? UGC_QUERY_TYPE_RANKED_BY_TEXT_SEARCH : UGC_QUERY_TYPE_RANKED_BY_PUBLICATION_DATE,
                UGC_TYPE_ITEMS, appId, appId, config)
        return {
            totalResults: result.totalResults,
            returnedResults: result.returnedResults,
            items: result.items.filter(Boolean).map(normalizeItem),
        }
    }

    // The subscribed items with their state and install folder, and the titles Steam returns for them.
    async subscribed() {
        const ids = this.client.workshop.getSubscribedItems()
        if (ids.length === 0) return []
        const titles = new Map()
        const found = await this.client.workshop.getItems(ids, { cachedResponseMaxAge: 0 })
        for (const item of found.items.filter(Boolean)) titles.set(String(item.publishedFileId), item.title)
        return ids.map((id) => ({
            publishedFileId: String(id),
            title: titles.get(String(id)) ?? null,
            state: this.client.workshop.state(id),
            installed: this.client.workshop.installInfo(id) !== null,
        }))
    }

    shutdown() {
        if (typeof this.binding.shutdown === 'function') this.binding.shutdown()
    }
}

// Connects to the running, logged-in Steam client for one AppID. The version check (when `need` is given) runs before the
// native module is loaded, so a refused feature sends nothing and loads nothing.
export async function connect({ appId, env = process.env, need, checkOwnership = true } = {}) {
    if (need) requireVersion(locateBinding(env).version, need.version, need.feature)
    const { binding } = loadBinding(env)
    let client
    try {
        client = binding.init(appId)
    } catch (error) {
        throw new CommandError(`cannot reach the Steam client (start Steam and log in as the same OS user): ${error.message}`)
    }
    if (!client) throw new CommandError('the Steam client did not initialise')
    const session = new SteamSession(client, binding)
    if (checkOwnership && appId !== undefined && !session.ownsApp(appId)) {
        session.shutdown()
        throw new CommandError(`this Steam account does not own app ${appId}`)
    }
    return session
}

export const defaultSteam = { connect, locateBinding, loadBinding }
