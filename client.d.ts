/**
 * Initializes the Steam client for this process and requests the user's stats. If a client already exists, it is dropped first.
 * Needs the Steam client to be running. Throws an Error carrying Steam's reason when initialization fails.
 * Unverified against a live Steam client: whether a logged-out Steam client initializes.
 * @param appId - The Steam app ID to initialize as. Omit it to use the app ID the SDK resolves on its own (for example from `steam_appid.txt`).
 */
export declare function init(appId?: number | undefined | null): void
/**
 * Checks whether Steam must relaunch this app. Does not need `init()`.
 * Returns true when the app was not started by Steam and has no `steam_appid.txt`. Steam then starts the app through its client, and the app should exit as soon as possible. Returns false when Steam launched the app or `steam_appid.txt` is present.
 * @param appId - The Steam app ID of the game.
 * @returns true if Steam is relaunching the app and it should quit, otherwise false.
 */
export declare function restartAppIfNecessary(appId: number): boolean
/**
 * Dispatches pending Steam callbacks and call results to the handlers registered with `register()` and to pending async calls. Call it regularly, for example once per frame or on a timer, or events are delayed.
 * Does nothing before `init()` or after `shutdown()`.
 */
export declare function runCallbacks(): void
/**
 * Releases the Steam client, which shuts down the Steam API. Safe to call when no client exists.
 * After this call `isConnected()` returns false, and `init()` must run again before other Steam APIs are used.
 */
export declare function shutdown(): void
/**
 * Returns whether a Steam client is held, meaning `init()` succeeded and `shutdown()` has not been called since. Does not check that the Steam client is running or that a user is logged in.
 * @returns true if the client is initialized, otherwise false.
 */
export declare function isConnected(): boolean
export interface PlayerSteamId {
  steamId64: bigint
  steamId32: string
  accountId: number
}
export declare namespace achievement {
  /**
   * Unlocks an achievement and stores the change to Steam. Needs `init()`, which requests the user's stats.
   * Returns true when Steam accepted both the unlock and the store request. The store finishes asynchronously, and its result arrives through the UserStatsStored callback while `runCallbacks()` runs.
   * @param achievement - The achievement API name as configured in Steamworks.
   * @returns true if the request was accepted, otherwise false (for example an unknown name, or stats that Steam has not received yet).
   */
  export function activate(achievement: string): boolean
  /**
   * Checks whether the user has unlocked an achievement. Needs `init()`, which requests the user's stats.
   * @param achievement - The achievement API name as configured in Steamworks.
   * @returns true if unlocked, otherwise false. False is also returned when the lookup fails (unknown name, or stats not received yet), so a failed lookup cannot be told apart from a locked achievement.
   */
  export function isActivated(achievement: string): boolean
  /**
   * Re-locks an achievement and stores the change to Steam. Same requirements as `activate()`.
   * @param achievement - The achievement API name as configured in Steamworks.
   * @returns true if Steam accepted both the clear and the store request, otherwise false.
   */
  export function clear(achievement: string): boolean
  /**
   * Returns the API names of all achievements defined for the app. Needs `init()`.
   * Returns an empty array when the app defines no achievements or Steam has no list yet, so an empty result can mean either; use `getNumAchievements()` on `stats` to tell "not loaded" from a count.
   * @returns the achievement API names defined for the app.
   */
  export function names(): Array<string>
  /**
   * Fetches the global unlock percentages of every achievement. Resolves once Steam has answered;
   * the request is driven by `runCallbacks()`.
   */
  export function requestGlobalPercentages(): Promise<void>
  /**
   * @returns the global percentage of players who unlocked the achievement (0 to 100), or `null` when no data is available.
   * Call `requestGlobalPercentages()` first.
   */
  export function getAchievedPercent(achievement: string): number | null
  /** The bounds of the progress stat that Steam links to an achievement. */
  export interface AchievementProgressLimits {
    /** Lowest value of the linked stat. */
    min: number
    /** Value of the linked stat at which the achievement is complete. */
    max: number
    /** `true` when the linked stat is a float stat, `false` when it is an integer stat. */
    isFloat: boolean
  }
  /** Everything Steam knows about one achievement for the local user, ready for display. */
  export interface AchievementInfo {
    /** The achievement API name as configured in Steamworks. */
    name: string
    /** Localized display name, or left out (`undefined`) when Steam has none (stats not received, or the achievement is not published). */
    displayName?: string
    /** Localized description, or left out when Steam has none. Steam may return a placeholder text for hidden achievements that are still locked. */
    description?: string
    /** `true` for a hidden achievement, left out when Steam does not say. */
    hidden?: boolean
    /** Whether the local user has unlocked the achievement. */
    unlocked: boolean
    /** When the achievement was unlocked, in seconds since 1970-01-01 UTC (multiply by 1000 for `new Date()`). left out when the achievement is locked or Steam has no time for it. Steam reports `0` for unlocks before December 2009, which is also left out. */
    unlockTime?: number
    /** Global percentage of players who unlocked it (0 to 100). left out until `requestGlobalPercentages()` has resolved, or when Steam has no data (always for AppId 480). */
    globalPercent?: number
    /** Bounds of the progress stat linked to the achievement, or left out when the achievement has none. */
    progressLimits?: AchievementProgressLimits
  }
  /** An achievement icon as raw pixels. */
  export interface AchievementIcon {
    /** Width in pixels. */
    width: number
    /** Height in pixels. */
    height: number
    /** `width * height * 4` bytes of RGBA, row by row. */
    rgba: Buffer
  }
  /**
   * Reads everything needed to display one achievement: name, description, hidden flag, unlocked state, unlock time, global percentage and progress limits. Needs `init()`, which requests the user's stats.
   * Call `requestGlobalPercentages()` first to get `globalPercent`; the icon is read separately with `getIcon()`.
   * @param achievement - The achievement API name as configured in Steamworks.
   * @returns the achievement, or `null` when Steam cannot read it (unknown name, or stats not received yet). That failure is not the same as a locked achievement.
   */
  export function getInfo(achievement: string): AchievementInfo | null
  /**
   * Reads every achievement the app defines, in the order Steam lists them. Same data as `getInfo()` per entry.
   * An achievement Steam cannot read is skipped, so compare the length with `stats.getNumAchievements()` to detect missing entries. Returns an empty array when the app defines no achievements or the stats are not loaded.
   * Call `requestGlobalPercentages()` first to fill `globalPercent`.
   */
  export function getAll(): Array<AchievementInfo>
  /**
   * Returns when the user unlocked an achievement.
   * @param achievement - The achievement API name as configured in Steamworks.
   * @returns seconds since 1970-01-01 UTC, or `null` when the achievement is locked, Steam has no time for it, or the lookup fails.
   */
  export function getUnlockTime(achievement: string): number | null
  /**
   * Returns the bounds of the progress stat that Steam links to an achievement. The current value of that stat is not part of the achievement API; read it with `stats.getInt()` or `stats.getFloat()` using the stat name from the Steamworks configuration.
   * @param achievement - The achievement API name as configured in Steamworks.
   * @returns the limits, or `null` when the achievement has no linked progress stat or the lookup fails.
   */
  export function getProgressLimits(achievement: string): AchievementProgressLimits | null
  /**
   * Shows the Steam overlay progress notification for an achievement. It does not unlock the achievement, even when `current` equals `max`; call `activate()` for that.
   * @param achievement - The achievement API name as configured in Steamworks.
   * @param current - the progress reached
   * @param max - the progress that completes the achievement
   * @returns `true` when Steam accepted the request, otherwise `false`.
   */
  export function indicateProgress(achievement: string, current: number, max: number): boolean
  /**
   * Reads the icon of an achievement as raw RGBA pixels, unlocked or locked according to the user's state (Steam chooses).
   * @param achievement - The achievement API name as configured in Steamworks.
   * @returns the icon, or `null` while Steam has not fetched it yet or when the achievement has no icon. Use `loadIcon()` to wait for it.
   */
  export function getIcon(achievement: string): AchievementIcon | null
  /**
   * Like `getIcon()`, but waits for Steam to fetch the icon. Steam answers inside `runCallbacks()`, which `init()` already runs on a timer.
   * @param achievement - The achievement API name as configured in Steamworks.
   * @param timeoutMs - how long to wait, in milliseconds; defaults to 5000
   * @returns the icon, or `null` when it is still missing after the timeout (no icon is set, or Steam is slow). The two cases cannot be told apart.
   */
  export function loadIcon(achievement: string, timeoutMs?: number | undefined | null): Promise<AchievementIcon | null>
  /** One entry of the global "most achieved" ranking, as returned by `getMostAchievedAchievements()`. */
  export interface AchievementRank {
    /** The achievement API name as configured in Steamworks. */
    name: string
    /** The global unlock percentage, from 0 to 100. */
    percent: number
    /** Whether the local user has unlocked the achievement. */
    achieved: boolean
  }
  /**
   * Returns the app's achievements ranked by global unlock percentage, in the order Steam lists them (most achieved first).
   * Call `requestGlobalPercentages()` first. Returns an empty array while the percentages are not loaded or when the app has no achievements.
   * @returns the ranking, one entry per achievement
   */
  export function getMostAchievedAchievements(): Array<AchievementRank>
}
export declare namespace apps {
  /** The metadata of one DLC, as listed by `getDlcs()`. */
  export interface DlcInfo {
    /** The DLC's Steam app ID. */
    appId: number
    /** Steam's `available` flag for the DLC. The SDK header does not define it any further (unverified against a live Steam client). */
    available: boolean
    /** The DLC name as Steam reports it. */
    name: string
  }
  /** The bytes of an optional DLC, as returned by `getDlcDownloadProgress()`. */
  export interface DlcDownloadProgress {
    /** The bytes downloaded so far. */
    bytesDownloaded: bigint
    /** The total bytes to download. */
    bytesTotal: bigint
  }
  /** The size, SHA-1 hash and flags of a file, as returned by `getFileDetails()`. */
  export interface FileDetails {
    /** The original file size in bytes. */
    size: bigint
    /** The SHA-1 hash of the original file, as 40 lowercase hexadecimal characters. */
    sha1: string
    /** The flags as Steam reports them. The SDK header does not define them (unverified against a live Steam client). */
    flags: number
  }
  /** The time limits of a timed trial, as returned by `getTimedTrial()`. */
  export interface TimedTrial {
    /** The playtime allowed, in seconds. */
    secondsAllowed: number
    /** The playtime used so far, in seconds. */
    secondsPlayed: number
  }
  /** A beta branch of the app, as listed by `getBetas()`. */
  export interface BetaBranch {
    /** The branch name, for example `public` for the default branch. */
    name: string
    /** The branch description as Steam reports it. */
    description: string
    /** The build ID the branch currently has. */
    buildId: number
    /** The raw `EBetaBranchFlags` bit set: 1 default, 2 available, 4 private, 8 selected, 16 installed. */
    flags: number
    /** `true` for the default `public` branch. */
    isDefault: boolean
    /** `true` when the user can select the branch. */
    isAvailable: boolean
    /** `true` when the branch is password protected. */
    isPrivate: boolean
    /** `true` when the branch is the one selected for the user. */
    isSelected: boolean
    /** `true` when the branch is the one installed. */
    isInstalled: boolean
  }
  /**
   * Checks whether the user is subscribed to another app, such as a demo or a related game. Per the SDK docs, use it for ownership of an app related to yours, not as a general ownership check.
   * @param appId - The Steam app ID to check.
   * @returns true if the user is subscribed to the app, otherwise false.
   */
  export function isSubscribedApp(appId: number): boolean
  /**
   * Checks whether the app is installed for the current user. An installed app does not mean the user owns it.
   * @param appId - The Steam app ID to check.
   * @returns true if the app is currently installed, otherwise false.
   */
  export function isAppInstalled(appId: number): boolean
  /**
   * Checks whether the user owns the DLC and has it installed.
   * @param appId - The Steam app ID of the DLC.
   * @returns true if the DLC is owned and installed, otherwise false.
   */
  export function isDlcInstalled(appId: number): boolean
  /**
   * Checks whether the user is subscribed through a free weekend.
   * @returns true if so, otherwise false.
   */
  export function isSubscribedFromFreeWeekend(): boolean
  /**
   * Checks whether the user's account has a VAC ban.
   * @returns true if the account is VAC banned, otherwise false.
   */
  export function isVacBanned(): boolean
  /**
   * Checks whether the license for the current app is a cyber cafe license.
   * @returns true if it is, otherwise false.
   */
  export function isCybercafe(): boolean
  /**
   * Checks whether the license for the current app provides low violence depots.
   * @returns true if it does, otherwise false.
   */
  export function isLowViolence(): boolean
  /**
   * Checks whether the user is subscribed to the current app.
   * @returns true if subscribed, otherwise false.
   */
  export function isSubscribed(): boolean
  /**
   * Returns the build ID of the current app as Steam reports it.
   * @returns the build ID as a signed 32-bit integer.
   */
  export function appBuildId(): number
  /**
   * Returns the install folder of an app. Works even when the app is not installed, returning the folder it would use in the default location.
   * @param appId - The Steam app ID to look up.
   * @returns the install folder path.
   */
  export function appInstallDir(appId: number): string
  /**
   * Returns the original owner of the current app. It differs from the current user only when the app is borrowed.
   * @returns the owner as a PlayerSteamId with `steamId64`, `steamId32` and `accountId` fields.
   */
  export function appOwner(): PlayerSteamId
  /**
   * Returns the languages the current app supports.
   * @returns the language names as Steam reports them, or an empty array when none are listed.
   */
  export function availableGameLanguages(): Array<string>
  /**
   * Returns the language the user has set for the current game. If the user has not set one, Steam returns the language of the Steam UI.
   * @returns the language name as Steam reports it.
   */
  export function currentGameLanguage(): string
  /**
   * Returns the beta branch the user is on for the current app.
   * @returns the beta branch name, or `null` when the user is on the default branch.
   */
  export function currentBetaName(): string | null
  /** @returns the command line the game was launched with, or an empty string */
  export function launchCommandLine(): string
  /** @returns the value of a query parameter from the Steam launch link, or an empty string when there is none */
  export function launchQueryParam(key: string): string
  /**
   * Returns the Unix time (seconds since 1970-01-01 UTC) of the user's earliest purchase of the app. The SDK header does not say what is returned when the user has no purchase; unverified against a live Steam client.
   * @param appId - the Steam app ID to look up
   * @returns the Unix time, as an unsigned 32-bit integer
   */
  export function getEarliestPurchaseUnixTime(appId: number): number
  /**
   * Lists the DLC of the running app. Entries that the SDK does not return are left out, so the list can be shorter than the DLC count. Needs `init()`.
   * @returns each DLC's app ID, availability flag and name, in the SDK's order
   */
  export function getDlcs(): Array<DlcInfo>
  /**
   * Starts installing an optional DLC. This changes the local installation: Steam starts downloading the DLC. Follow the progress with `getDlcDownloadProgress()`.
   * @param appId - the DLC's Steam app ID
   */
  export function installDlc(appId: number): void
  /**
   * Uninstalls an optional DLC. This changes the local installation of the DLC. It does not change ownership.
   * @param appId - the DLC's Steam app ID
   */
  export function uninstallDlc(appId: number): void
  /**
   * Tells Steam that the game files seem corrupt or missing. This changes the local installation: Steam acts on the report. What Steam then does is unverified against a live Steam client.
   * @param missingFilesOnly - `true` to report only the missing files
   * @returns the SDK's result as it is
   */
  export function markContentCorrupt(missingFilesOnly: boolean): boolean
  /**
   * Returns the depot IDs installed for the app, in mount order. At most 256 depots are read.
   * @param appId - the Steam app ID
   * @returns the depot IDs, or an empty array when none are reported
   */
  export function getInstalledDepots(appId: number): Array<number>
  /**
   * Returns the bytes downloaded and the total bytes of an optional DLC that is being installed.
   * @param appId - the DLC's Steam app ID
   * @returns the progress, or `null` when Steam reports none for the app
   */
  export function getDlcDownloadProgress(appId: number): DlcDownloadProgress | null
  /**
   * Reads the size, SHA-1 hash and flags of a file of the app. The request is answered while `runCallbacks()` runs. Needs `init()`.
   * @param fileName - the file name to look up; a name with a NUL character is rejected
   * @returns the file details; rejects when Steam reports an error or the answer is lost
   */
  export function getFileDetails(fileName: string): Promise<FileDetails>
  /** @returns `true` when the user has the app through Family Sharing. Then `appOwner()` returns the lender, otherwise `false` */
  export function isSubscribedFromFamilySharing(): boolean
  /**
   * Returns the time limits of the running app's timed trial. Needs `init()`.
   * @returns the limits, or `null` when the app is not a timed trial
   */
  export function getTimedTrial(): TimedTrial | null
  /**
   * Tells Steam which DLC the user is playing, or none. Steam uses it to track the use of major DLC. Needs `init()`.
   * @param appId - the DLC's Steam app ID, or `0` for none
   * @returns the SDK's result as it is
   */
  export function setDlcContext(appId: number): boolean
  /**
   * Lists every beta branch of the app, including the default `public` branch. Needs `init()`.
   * @returns the branches in the SDK's order; the array is empty when Steam reports none
   */
  export function getBetas(): Array<BetaBranch>
  /**
   * Selects a beta branch of the app; pass `public` to return to the default branch. This changes the local installation: Steam may need the game to restart before it updates to the new branch. Needs `init()`.
   * @param name - the branch name, as `getBetas()` lists it
   * @returns `true` when Steam accepted the branch, otherwise `false` (for example a name with a NUL character, or a name Steam refuses)
   */
  export function setActiveBeta(name: string): boolean
  /**
   * Requests the legacy proof-of-purchase (CD) key of the app or one of its DLC. The key arrives later in an `AppProofOfPurchaseKeyResponse` callback, which `callback.register` receives while `runCallbacks()` runs. The key is a secret: do not log it.
   * @param appId - the Steam app ID of the app or DLC
   */
  export function requestProofOfPurchaseKey(appId: number): void
  /** Requests every proof-of-purchase key of the app and its DLC. One `AppProofOfPurchaseKeyResponse` callback arrives per key, then a final one with `appId` `0` and an empty key. The keys are secrets: do not log them. */
  export function requestAllProofOfPurchaseKeys(): void
}
export declare namespace auth {
  /**
   * @param steamId64 - The user steam id or game server steam id. Use as NetworkIdentity of the remote system that will authenticate the ticket. If it is peer-to-peer then the user steam ID. If it is a game server, then the game server steam ID may be used if it was obtained from a trusted 3rd party
   * @param timeoutSeconds - The number of seconds to wait for the ticket to be validated. Default value is 10 seconds.
   */
  export function getSessionTicketWithSteamId(steamId64: bigint, timeoutSeconds?: number | undefined | null): Promise<Ticket>
  /**
   * @param ip - The string of IPv4 or IPv6 address. Use as NetworkIdentity of the remote system that will authenticate the ticket.
   * @param timeoutSeconds - The number of seconds to wait for the ticket to be validated. Default value is 10 seconds.
   */
  export function getSessionTicketWithIp(ip: string, timeoutSeconds?: number | undefined | null): Promise<Ticket>
  /**
   * Requests an auth session ticket for a Steam Web API service and waits for Steam to validate it. Needs `init()`.
   * Rejects with Steam's error on failure, or with "Steam didn't validated the ticket in time." when Steam does not answer within the timeout. The ticket is cancelled in both cases. Call `cancel()` on the returned Ticket once the remote side no longer needs it.
   * @param identity - The identity string of the Web API service that will validate the ticket.
   * @param timeoutSeconds - Seconds to wait for Steam before rejecting. Defaults to 10.
   * @returns a Ticket holding the ticket bytes, readable with `getBytes()`.
   */
  export function getAuthTicketForWebApi(identity: string, timeoutSeconds?: number | undefined | null): Promise<Ticket>
  /**
   * Requests an encrypted app ticket for this app, with optional bytes encrypted into it. Needs `init()`. This sends a request to Steam.
   * Resolves once Steam has the ticket; then read it with `getEncryptedAppTicket()`. Steam's answer is delivered through `runCallbacks()`, which `init()` already calls.
   * Rejects when Steam reports an error, when `dataToInclude` is larger than 2^31 - 1 bytes (nothing is sent). There is no timeout: if Steam never answers, the Promise stays pending and the outcome is unknown.
   * @param dataToInclude - optional bytes to encrypt into the ticket.
   */
  export function requestEncryptedAppTicket(dataToInclude?: Buffer | undefined | null): Promise<void>
  /**
   * Returns the encrypted app ticket that `requestEncryptedAppTicket()` asked for. Needs `init()`. Does not send a request.
   * @returns the ticket as a Buffer to send to your server, or `null` when no ticket is ready.
   */
  export function getEncryptedAppTicket(): Buffer | null
  /**
   * Requests a store checkout URL that signs in the in-game browser, then redirects to `redirectUrl`. Needs `init()`.
   * The SDK says the URL has a very short lifetime, so open it right away. Its auth cookie lasts a day, and the SDK suggests requesting a new URL about every 12 hours.
   * Resolves with the URL. Rejects when `redirectUrl` contains a NUL character (nothing is sent), or when Steam returns an empty URL. There is no timeout: if Steam never answers, the Promise stays pending.
   * @param redirectUrl - the page the store redirects to after checkout.
   * @returns the store authorization URL.
   */
  export function requestStoreAuthUrl(redirectUrl: string): Promise<string>
  export class Ticket {
    /** Cancels the auth ticket with Steam so it can no longer be used. Call it only while the Steam client is initialized. */
    cancel(): void
    /**
     * Returns a copy of the ticket bytes. Does not call Steam.
     * @returns the ticket as a Buffer, to send to the service that validates it.
     */
    getBytes(): Buffer
  }
}
export declare namespace callback {
  export const enum SteamCallback {
    PersonaStateChange = 0,
    SteamServersConnected = 1,
    SteamServersDisconnected = 2,
    SteamServerConnectFailure = 3,
    LobbyDataUpdate = 4,
    LobbyChatUpdate = 5,
    P2PSessionRequest = 6,
    P2PSessionConnectFail = 7,
    GameLobbyJoinRequested = 8,
    MicroTxnAuthorizationResponse = 9,
    DownloadItemResult = 10,
    UserStatsReceived = 11,
    UserStatsStored = 12,
    UserAchievementStored = 13,
    GameOverlayActivated = 14,
    GameRichPresenceJoinRequested = 15,
    LobbyEnter = 16,
    LobbyChatMsg = 17,
    ScreenshotRequested = 18,
    ScreenshotReady = 19,
    NewUrlLaunchParameters = 20,
    AuthSessionTicketResponse = 21,
    ValidateAuthTicketResponse = 22,
    AppProofOfPurchaseKeyResponse = 23,
    GameConnectedFriendChatMsg = 24,
    GameConnectedClanChatMsg = 25,
    GameConnectedChatJoin = 26,
    GameConnectedChatLeave = 27,
    FriendRichPresenceUpdate = 28,
    UnreadChatMessagesChanged = 29,
    OverlayBrowserProtocolNavigation = 30,
    EquippedProfileItemsChanged = 31
  }
  /**
   * Registers a handler for a Steam callback. Needs `init()`.
   * The handler receives each callback payload as a JSON-compatible value on the JavaScript event loop. Steam events are dispatched only while `runCallbacks()` runs.
   * @param steamCallback - The callback kind to listen for.
   * @param handler - Called with each payload of that callback.
   * @returns a Handle; call `disconnect()` on it to stop the handler.
   */
  export function register<C extends keyof import('./callbacks').CallbackReturns>(steamCallback: C, handler: (value: import('./callbacks').CallbackReturns[C]) => void): Handle
  export class Handle {
    /** Stops the handler registered for this Handle from being called. Calling it again does nothing. */
    disconnect(): void
  }
}
export declare namespace cloud {
  /**
   * Checks whether Steam Cloud is enabled for the user's account. This is separate from the app setting (`isEnabledForApp()`).
   * @returns true if enabled for the account, otherwise false.
   */
  export function isEnabledForAccount(): boolean
  /**
   * Checks whether Steam Cloud is enabled for the current app. This is separate from the account setting (`isEnabledForAccount()`).
   * @returns true if enabled for the app, otherwise false.
   */
  export function isEnabledForApp(): boolean
  /**
   * Turns Steam Cloud on or off for the current app. It does not change the account setting. Returns nothing, and the binding does not report whether Steam applied the change.
   * @param enabled - true to enable Steam Cloud for the app, false to disable it.
   */
  export function setEnabledForApp(enabled: boolean): void
  /**
   * Reads a Steam Cloud file as UTF-8 text. Needs `init()`.
   * Rejects with "Failed to read file" when the file cannot be read or its bytes are not valid UTF-8. Unverified against a live Steam client: a missing file is read as empty text on this code path.
   * @param name - The cloud file name.
   * @returns the file content as a string.
   */
  export function readFile(name: string): string
  /**
   * Writes text to a Steam Cloud file as UTF-8, replacing its previous content. Needs `init()`.
   * The write is committed when the write stream closes, which happens before this call returns.
   * @param name - The cloud file name.
   * @param content - Text to write, encoded as UTF-8.
   * @returns true if the content was accepted by the write stream, false if writing failed. The commit result is not reported. Unverified against a live Steam client whether a failed commit is visible.
   */
  export function writeFile(name: string, content: string): boolean
  /**
   * Deletes a Steam Cloud file both locally and in the cloud. Needs `init()`.
   * @param name - The cloud file name.
   * @returns true if a file was deleted, false if none was.
   */
  export function deleteFile(name: string): boolean
  /**
   * Checks whether a Steam Cloud file exists. Needs `init()`.
   * @param name - The cloud file name.
   * @returns true if the file exists, otherwise false.
   */
  export function fileExists(name: string): boolean
  /**
   * Lists the Steam Cloud files of the current app. Needs `init()`.
   * @returns an array of entries with `name` and `size` fields, where size is the file size in bytes as a BigInt. The array is empty when there are no files.
   */
  export function listFiles(): Array<FileInfo>
  /** The platforms a cloud file syncs to. */
  export const enum SyncPlatform {
    None = 0,
    Windows = 1,
    MacOS = 2,
    Linux = 3,
    /** Every platform the binding knows about. */
    All = 4
  }
  /**
   * Shares a cloud file so others can link to it. Resolves with the share handle.
   * Resolution needs `runCallbacks()`, which `init()` already calls.
   */
  export function shareFile(name: string): Promise<bigint>
  /**
   * Stops syncing a cloud file. The Steam copy stays, and the local copy is no longer synced.
   * @returns true on success
   */
  export function forgetFile(name: string): boolean
  /** @returns the platform a cloud file syncs to. Rejects when the file syncs to a combination of platforms. */
  export function getSyncPlatforms(name: string): SyncPlatform
  /** Sets the platform a cloud file syncs to. */
  export function setSyncPlatforms(name: string, platform: SyncPlatform): void
  /** The Steam Cloud quota, in bytes. */
  export interface CloudQuota {
    /** The total quota. */
    total: bigint
    /** The part of the quota that is still available. */
    available: bigint
  }
  /**
   * Returns the Steam Cloud quota in bytes. Needs `init()`. The SDK header does not say whether the quota is per account or per app; unverified against a live Steam client.
   * @returns `total` and `available` as BigInts, or `null` when Steam reports no quota.
   */
  export function getQuota(): CloudQuota | null
  /**
   * Replaces the content of a Steam Cloud file with `content`, asynchronously. Needs `init()`. This sends data to Steam.
   * Resolves once Steam has stored the file. The result is delivered through `runCallbacks()`, which `init()` already calls.
   * Rejects when the name contains a NUL character or the content is larger than 4 GB (nothing is sent), or when Steam reports an error. There is no timeout: if Steam never answers, the Promise stays pending and the outcome is unknown.
   * The header caps a file at 200 MB and a single chunk at 100 MB; Steam enforces those limits.
   * @param name - The cloud file name.
   * @param content - The bytes to store.
   */
  export function writeFileAsync(name: string, content: Buffer): Promise<void>
  /**
   * Opens a Steam Cloud write stream on a file, for writing content in chunks. Needs `init()`. The file changes only when `close()` commits the stream.
   * Throws when the name contains a NUL character, or when Steam does not open the stream.
   * @param name - The cloud file name.
   * @returns the open stream.
   */
  export function openWriteStream(name: string): FileWriteStream
  /**
   * Starts a batch of cloud file writes, so that several file changes count as one, for example the two files of one save. Pair it with `endFileWriteBatch()`. Needs `init()`.
   * @returns the SDK's result.
   */
  export function beginFileWriteBatch(): boolean
  /**
   * Ends a batch started with `beginFileWriteBatch()`. Needs `init()`.
   * @returns the SDK's result.
   */
  export function endFileWriteBatch(): boolean
  /** What happened to a cloud file that changed on another device, from Steam's `ERemoteStorageLocalFileChange`. */
  export const enum LocalFileChangeType {
    /** The SDK reports no change. */
    Invalid = 0,
    /** The file was updated from another device. */
    FileUpdated = 1,
    /** The file was deleted by another device. */
    FileDeleted = 2,
    /** A value this binding does not name. */
    Unknown = -1
  }
  /** How the path of a changed cloud file is given, from Steam's `ERemoteStorageFilePathType`. */
  export const enum FilePathType {
    /** The SDK reports no path type. */
    Invalid = 0,
    /** The game reads the file directly, and the path is the full path. */
    Absolute = 1,
    /** The file is accessed through the Steam Cloud API, and the path is the file name. */
    ApiFilename = 2,
    /** A value this binding does not name. */
    Unknown = -1
  }
  /** A cloud file that changed on another device, from `getLocalFileChanges()`. */
  export interface LocalFileChange {
    /** The path or file name, as the SDK gives it. */
    path: string
    /** What happened to the file. */
    changeType: LocalFileChangeType
    /** How `path` is given. */
    pathType: FilePathType
  }
  /**
   * Returns the cloud files that changed on another device since the last call. Needs `init()`.
   * Entries for which the SDK returns no path are skipped.
   * @returns an array of entries with `path`, `changeType` and `pathType`; empty when nothing changed.
   */
  export function getLocalFileChanges(): Array<LocalFileChange>
  /** The result of a UGC download, from `downloadUgc()` and `downloadUgcToLocation()`. */
  export interface UgcDownloadResult {
    /** The handle of the downloaded file. */
    handle: bigint
    /** The app that created the file. */
    appId: number
    /** The size of the downloaded file in bytes. */
    sizeInBytes: number
    /** The file name the creator gave it. */
    fileName: string
    /** The SteamID of the user who created the content. */
    owner: bigint
  }
  /**
   * Downloads a user-generated content (UGC) file, such as a Workshop file, by its handle. Needs `init()`. This starts network transfers.
   * Resolves with the file's details once the download completes; `runCallbacks()`, which `init()` already calls, drives the result.
   * Rejects when `handle` is not a non-negative BigInt below 2^64, or when Steam reports an error. There is no timeout: if Steam never answers, the Promise stays pending and the outcome is unknown.
   * @param handle - The UGC handle as a BigInt.
   * @param priority - 0 downloads at once. A higher value waits until downloads with lower values finish; equal values download together (from the SDK header).
   * @returns the file's handle, app id, size, file name and owner.
   */
  export function downloadUgc(handle: bigint, priority: number): Promise<UgcDownloadResult>
  /**
   * Downloads a UGC file like `downloadUgc()`, but to the path `location`. Needs `init()`. This starts network transfers.
   * The header gives no detail on the location format, so the result of a custom location is unverified against a live Steam client.
   * Rejects when `handle` is invalid, when `location` contains a NUL character (nothing is downloaded), or when Steam reports an error. There is no timeout: if Steam never answers, the Promise stays pending.
   * @param handle - The UGC handle as a BigInt.
   * @param location - The path to write the file to.
   * @param priority - 0 downloads at once; see `downloadUgc()`.
   * @returns the file's handle, app id, size, file name and owner.
   */
  export function downloadUgcToLocation(handle: bigint, location: string, priority: number): Promise<UgcDownloadResult>
  /** Progress of a UGC download, from `getUgcDownloadProgress()`. */
  export interface UgcDownloadProgress {
    /** The number of bytes downloaded so far. */
    bytesDownloaded: number
    /** The number of bytes expected. It can be `0` before the transfer starts, so check it before dividing. */
    bytesExpected: number
  }
  /**
   * Returns how far a UGC download has progressed. Needs `init()`.
   * @param handle - The UGC handle as a BigInt.
   * @returns the byte counts, or `null` when Steam reports no progress for the handle.
   */
  export function getUgcDownloadProgress(handle: bigint): UgcDownloadProgress | null
  /** Metadata of a downloaded UGC file, from `getUgcDetails()`. */
  export interface UgcDetails {
    /** The app that created the file. */
    appId: number
    /** The file name the creator gave it. Empty when Steam returns no name. */
    fileName: string
    /** The size of the file in bytes. */
    sizeInBytes: number
    /** The SteamID of the user who created the content. */
    owner: bigint
  }
  /**
   * Returns the metadata of a downloaded UGC file, the same as in the download result. Needs `init()`.
   * @param handle - The UGC handle as a BigInt.
   * @returns the metadata, or `null` when Steam reports no details.
   */
  export function getUgcDetails(handle: bigint): UgcDetails | null
  /** How `readUgc()` treats the file handle after a read, from Steam's `EUGCReadAction`. */
  export const enum UgcReadAction {
    /** Keeps the handle open until the last byte is read, then closes it. Use it for sequential reads. */
    ContinueReadingUntilFinished = 0,
    /** Keeps the handle open, so the file can be read at several offsets. Finish with `Close`. */
    ContinueReading = 1,
    /** Frees the handle. Read the file again only after another download. */
    Close = 2
  }
  /**
   * Reads part of a downloaded UGC file into `buffer`, starting at `offset`. Needs `init()`.
   * The read length is the length of `buffer`, and the bytes are written into it in place. Files over 100 MB must be read in chunks (from the SDK header). `offset` is an unsigned 32-bit value, as in the SDK.
   * @param handle - The UGC handle as a BigInt.
   * @param buffer - The Buffer that receives the bytes. Its length is the read length.
   * @param offset - The byte offset to start reading at.
   * @param action - How the handle is treated after the read.
   * @returns the number of bytes read. `null` when Steam reports a negative count or the buffer is longer than 2^31 - 1 bytes; the SDK header does not define the failure value, so the `null` case is unverified.
   */
  export function readUgc(handle: bigint, buffer: Buffer, offset: number, action: UgcReadAction): number | null
  /**
   * Returns how many downloaded UGC files are waiting to be read with `readUgc()`. Needs `init()`.
   * @returns the count.
   */
  export function getCachedUgcCount(): number
  /**
   * Returns the handle of a downloaded UGC file that is waiting to be read. Needs `init()`.
   * @param index - The index, from 0 to the count minus one.
   * @returns the handle as a BigInt, or `null` when Steam returns the invalid handle.
   */
  export function getCachedUgcHandle(index: number): bigint | null
  export class FileInfo {
    name: string
    size: bigint
  }
  /**
   * An open Steam Cloud write stream, from `openWriteStream()`. Write chunks, then call `close()` to commit them or `cancel()` to discard them.
   * If the object is garbage-collected without either call, the SDK closes the stream on drop, which commits the chunks written so far.
   */
  export class FileWriteStream {
    /**
     * Writes one chunk to the stream. Nothing changes in the cloud file until `close()`. The header caps a chunk at 100 MB.
     * @param data - The bytes of this chunk.
     * @returns true if Steam accepted the chunk; false if the stream is already closed or Steam refused the chunk.
     */
    writeChunk(data: Buffer): boolean
    /**
     * Commits the chunks written so far, so they become the file's content. The stream cannot be used afterwards.
     * @returns true if Steam accepted the commit; false if the stream was already closed or Steam refused the close.
     */
    close(): boolean
    /**
     * Discards the chunks without committing them. The stream cannot be used afterwards. The effect on the existing file is unverified against a live Steam client.
     * @returns true if Steam accepted the cancel; false if the stream was already closed or Steam refused it.
     */
    cancel(): boolean
  }
}
export declare namespace friends {
  export interface FriendInfo {
    /** The user's SteamID64, as a BigInt. */
    steamId64: bigint
    /** The user's display name. */
    name: string
    /** The nickname the local user set for this friend, or `null` when none is set. */
    nickName?: string | null
  }
  export interface CoplayInfo {
    /** AppID of the game played together, `0` when there is none. */
    appId: number
    /** Seconds since the local user last played with this user. */
    time: number
  }
  export const enum FriendState {
    Offline = 0,
    Online = 1,
    Invisible = 2,
    Busy = 3,
    Away = 4,
    Snooze = 5,
    LookingToPlay = 6,
    LookingToTrade = 7
  }
  /** The relationship between the local user and another user (`EFriendRelationship`). */
  export const enum FriendRelationship {
    /** No relationship. */
    None = 0,
    /** The user is blocked. */
    Blocked = 1,
    /** The user has sent the local user a friend request. */
    RequestRecipient = 2,
    /** The user is a friend. */
    Friend = 3,
    /** The local user has sent the user a friend request. */
    RequestInitiator = 4,
    /** The local user ignores this user. */
    Ignored = 5,
    /** The user is a friend that the local user ignores. */
    IgnoredFriend = 6
  }
  /** The kind of a chat entry (`EChatEntryType`), as the SDK numbers it. */
  export const enum ChatEntryType {
    /** Not a valid entry, or a value this binding does not name. */
    Invalid = 0,
    /** A chat message. */
    ChatMsg = 1,
    /** The user is typing. */
    Typing = 2,
    /** A game invite. */
    InviteGame = 3,
    /** An emote. */
    Emote = 4,
    /** The user left the conversation. */
    LeftConversation = 6,
    /** The user entered the chat room. */
    Entered = 7,
    /** The user was kicked. */
    WasKicked = 8,
    /** The user was banned. */
    WasBanned = 9,
    /** The user disconnected. */
    Disconnected = 10,
    /** A message from the chat history. */
    HistoricalChat = 11,
    /** A link that Steam blocked. */
    LinkBlocked = 14
  }
  /** The answer of a clan chat room to a join request (`EChatRoomEnterResponse`). */
  export const enum ChatRoomEnterResponse {
    /** The join worked. Any other value means the game is not in the room. */
    Success = 1,
    /** The room does not exist. */
    DoesntExist = 2,
    /** The user may not join. */
    NotAllowed = 3,
    /** The room is full. */
    Full = 4,
    /** Steam reported an error. */
    Error = 5,
    /** The user is banned from the room. */
    Banned = 6,
    /** The user is limited from joining. */
    Limited = 7,
    /** The clan chat is disabled. */
    ClanDisabled = 8,
    /** The user is banned from the community. */
    CommunityBan = 9,
    /** A member of the room has blocked the user. */
    MemberBlockedYou = 10,
    /** The user has blocked a member of the room. */
    YouBlockedMember = 11,
    /** Too many join requests. */
    RatelimitExceeded = 12
  }
  /** The kind of a Community profile item (`ECommunityProfileItemType`). */
  export const enum ProfileItemType {
    AnimatedAvatar = 0,
    AvatarFrame = 1,
    ProfileModifier = 2,
    ProfileBackground = 3,
    MiniProfileBackground = 4
  }
  /**
   * A property of a Community profile item (`ECommunityProfileItemProperty`). The `AppId`, `TypeId` and `Class`
   * properties are numbers; read them with `getProfileItemPropertyUint`, the others with `getProfileItemPropertyString`.
   */
  export const enum ProfileItemProperty {
    ImageSmall = 0,
    ImageLarge = 1,
    InternalName = 2,
    Title = 3,
    Description = 4,
    AppId = 5,
    TypeId = 6,
    Class = 7,
    MovieWebM = 8,
    MovieMp4 = 9,
    MovieWebMSmall = 10,
    MovieMp4Small = 11
  }
  /** A friends group (tag) of the local user, with its members. */
  export interface FriendGroup {
    /** The group id, for `getFriendsGroupName` and `getFriendsGroupMembers`. */
    id: number
    /** The group name, or an empty string when Steam returns none. */
    name: string
    /** The SteamID64s of the members, as far as the local Steam client knows them. */
    members: Array<bigint>
  }
  /** How active a clan was, as the local Steam client last knew it. */
  export interface ClanActivity {
    /** Members online. */
    online: number
    /** Members in a game. */
    inGame: number
    /** Members in the clan chat. */
    chatting: number
  }
  /** A clan with the data that needs no request to Steam. */
  export interface ClanSummary {
    /** The clan's SteamID64. */
    steamId64: bigint
    /** The clan name, or `null` when Steam does not know it yet. */
    name?: string | null
    /** The clan tag, or `null` when Steam does not know it yet. */
    tag?: string | null
    /** The latest activity counts, or `null` when Steam has none (see `downloadClanActivityCounts`). */
    activity?: ClanActivity | null
  }
  /** A clan with its owner and officers, from `getClanInfo`. */
  export interface ClanInfo {
    /** The clan's SteamID64. */
    steamId64: bigint
    /** The clan name, or `null` when Steam does not know it. */
    name?: string | null
    /** The clan tag, or `null` when Steam does not know it. */
    tag?: string | null
    /** The latest activity counts, or `null` when Steam has none. */
    activity?: ClanActivity | null
    /** The SteamID64 of the clan owner, or `null` when it is not known. */
    owner?: bigint | null
    /** The SteamID64s of the officers, the owner included. */
    officers: Array<bigint>
  }
  /** A chat message from a clan chat room or a friend chat, from `getClanChatMessage` or `getFriendMessage`. */
  export interface ChatMessage {
    /** The SteamID64 of the sender. For a friend message this is the friend. */
    chatter: bigint
    /** The kind of entry, such as a chat message or a join notice. */
    entryType: ChatEntryType
    /** The text of the message. It is empty for entries that carry no text, and cut at the first NUL byte. */
    text: string
  }
  /** One page of the users the local user follows, from `enumerateFollowingList`. */
  export interface FollowingPage {
    /** The SteamID64s on this page, at most 50. */
    steamIds: Array<bigint>
    /** The total number of users in the list, across all pages. */
    totalCount: number
  }
  /** The Community profile items a user has equipped, from `requestEquippedProfileItems`. */
  export interface EquippedProfileItems {
    /** The user has an animated avatar equipped. */
    hasAnimatedAvatar: boolean
    /** The user has an avatar frame equipped. */
    hasAvatarFrame: boolean
    /** The user has a profile modifier equipped. */
    hasProfileModifier: boolean
    /** The user has a profile background equipped. */
    hasProfileBackground: boolean
    /** The user has a mini profile background equipped. */
    hasMiniProfileBackground: boolean
    /** `true` when Steam answered from its local cache instead of asking the server. */
    fromCache: boolean
  }
  /** @param flags - Steam friend relationship flags (`FriendFlags` bits), e.g. `0x4` for immediate friends */
  export function getFriends(flags: number): Array<FriendInfo>
  /** Players the local user has recently played with. */
  export function getCoplayFriends(): Array<FriendInfo>
  /**
   * Returns the online state of a friend as the local Steam client knows it.
   * Requires a running Steam client.
   * @param steamId64 - SteamID64 of the friend, as a BigInt
   * @returns the friend's `FriendState`
   */
  export function getFriendState(steamId64: bigint): FriendState
  /**
   * @param steamId64 - SteamID64 of the friend, as a BigInt
   * @returns the AppID of the game the friend is playing, or `null` when they are not in a game
   */
  export function getFriendGamePlayed(steamId64: bigint): number | null
  /**
   * Returns the most recent co-play record between the local user and a friend.
   * @param steamId64 - SteamID64 of the friend, as a BigInt
   * @returns `appId` of the game played together (`0` when there is none) and `time`, the seconds since they last played together
   */
  export function getFriendCoplayInfo(steamId64: bigint): CoplayInfo
  /**
   * @param steamId64 - SteamID64 of the friend, as a BigInt
   * @returns the small (32x32) avatar as RGBA pixels, or `null` when it has not been loaded
   */
  export function getSmallAvatar(steamId64: bigint): Buffer | null
  /**
   * @param steamId64 - SteamID64 of the friend, as a BigInt
   * @returns the medium (64x64) avatar as RGBA pixels, or `null` when it has not been loaded
   */
  export function getMediumAvatar(steamId64: bigint): Buffer | null
  /**
   * @param steamId64 - SteamID64 of the friend, as a BigInt
   * @returns the large (184x184) avatar as RGBA pixels, or `null` when it has not been loaded
   */
  export function getLargeAvatar(steamId64: bigint): Buffer | null
  /**
   * Asks Steam for a user's name and, unless `nameOnly` is set, avatar. Returns at once; the answer arrives later as a `PersonaStateChange` callback while `runCallbacks()` runs.
   * @param steamId64 - SteamID64 of the user, as a BigInt
   * @param nameOnly - `true` to skip the avatar download, which is slower and fills the local cache
   * @returns true when Steam will fetch the user information asynchronously (PersonaStateChange follows), false when the data is already known
   */
  export function requestUserInformation(steamId64: bigint, nameOnly: boolean): boolean
  /** Clears all of the local user's Rich Presence keys (see `localplayer.setRichPresence`). */
  export function clearRichPresence(): void
  /**
   * Sends a game invite that carries `connectString` to the friend. The friend sees the invite in Steam; accepting it starts the game with that connect string. This sends data to another user.
   * Throws when `connectString` contains a NUL character.
   * @param steamId64 - SteamID64 of the friend to invite, as a BigInt
   * @param connectString - The connect string the game receives when the invite is accepted
   */
  export function inviteUserToGame(steamId64: bigint, connectString: string): void
  /**
   * Marks the user as played with. The local user must currently be in game with them.
   * @param steamId64 - SteamID64 of the user, as a BigInt
   */
  export function setPlayedWith(steamId64: bigint): void
  /**
   * Returns the local user's own persona state (online, away, invisible, ...), as the local Steam client reports it.
   * Requires a running Steam client.
   * @returns the local user's `FriendState`
   */
  export function getPersonaState(): FriendState
  /**
   * Returns the relationship between the local user and a user (friend, blocked, pending request, ...).
   * @param steamId64 - SteamID64 of the user, as a BigInt
   * @returns the `FriendRelationship`, or `null` for the deprecated suggested value or a value this binding does not name
   */
  export function getFriendRelationship(steamId64: bigint): FriendRelationship | null
  /**
   * Returns an earlier display name of a user. Index `0` is the name before the current one.
   * @param steamId64 - SteamID64 of the user, as a BigInt
   * @param index - Position in the name history, counting back from the current name
   * @returns the old name, or `null` when there is no name at that index (the end of the history)
   */
  export function getFriendPersonaNameHistory(steamId64: bigint, index: number): string | null
  /**
   * Returns the Steam level of a user. It can be `0` until the local Steam client has the data (unverified against a live Steam client).
   * @param steamId64 - SteamID64 of the user, as a BigInt
   * @returns the Steam level
   */
  export function getFriendSteamLevel(steamId64: bigint): number
  /**
   * Returns the number of friends groups the local user has.
   * @returns the number of groups; `getFriendsGroupId` takes an index from `0` to this count minus one
   */
  export function getFriendsGroupCount(): number
  /**
   * Returns the id of the friends group at an index.
   * @param index - Index from `0` to `getFriendsGroupCount()` minus one
   * @returns the group id, or `null` when the index is not a group
   */
  export function getFriendsGroupId(index: number): number | null
  /**
   * Returns the name of a friends group.
   * @param groupId - Group id from `getFriendsGroupId`
   * @returns the name, or `null` when the id is not a group or the name is empty
   */
  export function getFriendsGroupName(groupId: number): string | null
  /**
   * Returns the number of members of a friends group.
   * @param groupId - Group id from `getFriendsGroupId`
   * @returns the number of members; `0` when the id is not a group
   */
  export function getFriendsGroupMembersCount(groupId: number): number
  /**
   * Returns the members of a friends group.
   * @param groupId - Group id from `getFriendsGroupId`
   * @returns the SteamID64s of the members; empty when the id is not a group. Slots Steam leaves empty are skipped.
   */
  export function getFriendsGroupMembers(groupId: number): Array<bigint>
  /**
   * Returns every friends group with its name and members, in index order.
   * @returns one `FriendGroup` per group, with `id`, `name` and `members` (SteamID64s as BigInt)
   */
  export function getFriendGroups(): Array<FriendGroup>
  /**
   * Returns the number of clans (groups) the local user is a member of.
   * @returns the number of clans; `getClanByIndex` takes an index from `0` to this count minus one
   */
  export function getClanCount(): number
  /**
   * Returns the SteamID64 of the clan at an index.
   * @param index - Index from `0` to `getClanCount()` minus one
   * @returns the clan's SteamID64 as a BigInt, or `null` when the SDK returns an invalid id
   */
  export function getClanByIndex(index: number): bigint | null
  /**
   * Returns the name of a clan. The local Steam client may not know it yet.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns the name, or `null` when Steam does not know it or the name is empty
   */
  export function getClanName(steamId64: bigint): string | null
  /**
   * Returns the tag of a clan. The local Steam client may not know it yet.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns the tag, or `null` when Steam does not know it or the tag is empty
   */
  export function getClanTag(steamId64: bigint): string | null
  /**
   * Returns the latest activity counts Steam knows for a clan. A clan the user is not a member of has counts only after `downloadClanActivityCounts`.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns the counts (`online`, `inGame`, `chatting`), or `null` when Steam has none
   */
  export function getClanActivityCounts(steamId64: bigint): ClanActivity | null
  /**
   * Returns every clan of the local user with its name, tag and activity counts. This makes no request to Steam, so
   * the owner and officers are not included; use `getClanInfo` for them.
   * @returns one `ClanSummary` per clan
   */
  export function getClans(): Array<ClanSummary>
  /**
   * Returns the owner of a clan. It is known only after `requestClanOfficerList` (or `getClanInfo`) has completed.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns the owner's SteamID64, or `null` when it is not known
   */
  export function getClanOwner(steamId64: bigint): bigint | null
  /**
   * Returns the number of officers of a clan, the owner included. Known only after `requestClanOfficerList` has completed.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns the number of officers
   */
  export function getClanOfficerCount(steamId64: bigint): number
  /**
   * Returns an officer of a clan. Known only after `requestClanOfficerList` has completed.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @param index - Index from `0` to `getClanOfficerCount()` minus one
   * @returns the officer's SteamID64, or `null` for an invalid id
   */
  export function getClanOfficerByIndex(steamId64: bigint, index: number): bigint | null
  /**
   * Returns whether a clan is public. Unknown clans may be reported as not public (unverified against a live Steam client).
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns true if the clan is public
   */
  export function isClanPublic(steamId64: bigint): boolean
  /**
   * Returns whether a clan is the official game group of an app (unverified against a live Steam client).
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns true if the clan is an official game group
   */
  export function isClanOfficialGameGroup(steamId64: bigint): boolean
  /**
   * Returns how many users the local user can see in a source (a clan, lobby, chat room or game server).
   * @param sourceId64 - The source's SteamID64, as a BigInt
   * @returns the number of users the local Steam client knows in that source
   */
  export function getFriendCountFromSource(sourceId64: bigint): number
  /**
   * Returns a user at an index in a source (see `getFriendCountFromSource`).
   * @param sourceId64 - The source's SteamID64, as a BigInt
   * @param index - Index from `0` to `getFriendCountFromSource(sourceId64)` minus one
   * @returns the user's SteamID64, or `null` for an invalid id
   */
  export function getFriendFromSourceByIndex(sourceId64: bigint, index: number): bigint | null
  /**
   * Returns whether the local user can see that a user is a member of, or in, a source.
   * @param userId64 - The user's SteamID64, as a BigInt
   * @param sourceId64 - The source's SteamID64, as a BigInt
   * @returns true if the user is in the source as far as the local Steam client knows
   */
  export function isUserInSource(userId64: bigint, sourceId64: bigint): boolean
  /**
   * Tells Steam that a user is pressing the talk button in the current game, which mutes the microphone of Steam friends voice chat for that user. Affects only the Steam client's friends UI (unverified against a live Steam client).
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @param speaking - `true` while the talk button is pressed
   */
  export function setInGameVoiceSpeaking(steamId64: bigint, speaking: boolean): void
  /**
   * Returns how many chats (friends or chat rooms) have unread messages that would show a notification. Watch the `UnreadChatMessagesChanged` callback to see when it changes.
   * @returns the number of chats with unread priority messages
   */
  export function getNumChatsWithUnreadPriorityMessages(): number
  /**
   * Opens the overlay's Remote Play Together invite dialog for a lobby. The user sends the invitations in the dialog. Requires the Steam overlay.
   * @param lobbyId - The lobby's id, as a BigInt
   */
  export function activateRemotePlayTogetherInviteDialog(lobbyId: bigint): void
  /**
   * Makes the overlay browser report navigations to a protocol instead of opening them. Steam then posts the `OverlayBrowserProtocolNavigation` callback.
   * Throws when `protocol` contains a NUL character.
   * @param protocol - The protocol name, for example `myapp`
   * @returns true when Steam accepted the protocol
   */
  export function registerProtocolInOverlayBrowser(protocol: string): boolean
  /**
   * Joins a clan chat room from inside the game. Resolves once Steam has answered; the request is driven by `runCallbacks()`.
   * Rejects when no answer arrives. Check the result: only `ChatRoomEnterResponse.Success` means the game is in the room.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns the room's `ChatRoomEnterResponse`
   */
  export function joinClanChatRoom(steamId64: bigint): Promise<ChatRoomEnterResponse>
  /**
   * Leaves a clan chat room the game has joined.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns true if Steam accepted the request, otherwise false (for example when the room is not joined)
   */
  export function leaveClanChatRoom(steamId64: bigint): boolean
  /**
   * Returns the number of members in a clan chat room the game has joined.
   * @param clanChatId64 - The chat room's SteamID64, as a BigInt
   * @returns the number of members
   */
  export function getClanChatMemberCount(clanChatId64: bigint): number
  /**
   * Returns a member of a clan chat room the game has joined.
   * @param clanChatId64 - The chat room's SteamID64, as a BigInt
   * @param index - Index from `0` to `getClanChatMemberCount` minus one
   * @returns the member's SteamID64, or `null` for an invalid id
   */
  export function getClanChatMemberByIndex(clanChatId64: bigint, index: number): bigint | null
  /**
   * Sends a message to a clan chat room the game has joined. The message is posted for every member of the room.
   * Throws when `text` contains a NUL character.
   * @param clanChatId64 - The chat room's SteamID64, as a BigInt
   * @param text - The message text
   * @returns true if Steam accepted the message
   */
  export function sendClanChatMessage(clanChatId64: bigint, text: string): boolean
  /**
   * Reads a message from a clan chat room the game has joined. Messages longer than 8192 bytes are cut.
   * @param clanChatId64 - The chat room's SteamID64, as a BigInt
   * @param index - The message index, from the `GameConnectedClanChatMsg` callback's `messageId`
   * @returns the `ChatMessage`, or `null` when Steam returns a negative length (whether an out-of-range index gives `null` is unverified against a live Steam client)
   */
  export function getClanChatMessage(clanChatId64: bigint, index: number): ChatMessage | null
  /**
   * Returns whether a user is an admin of a clan chat room.
   * @param clanChatId64 - The chat room's SteamID64, as a BigInt
   * @param userId64 - The user's SteamID64, as a BigInt
   * @returns true if the user is an admin
   */
  export function isClanChatAdmin(clanChatId64: bigint, userId64: bigint): boolean
  /**
   * Returns whether the clan chat window is open in the Steam client, outside the game.
   * @param clanChatId64 - The chat room's SteamID64, as a BigInt
   * @returns true if the window is open
   */
  export function isClanChatWindowOpenInSteam(clanChatId64: bigint): boolean
  /**
   * Opens the clan chat window in the Steam client, outside the game. This changes what the user sees.
   * @param clanChatId64 - The chat room's SteamID64, as a BigInt
   * @returns true if Steam opened it
   */
  export function openClanChatWindowInSteam(clanChatId64: bigint): boolean
  /**
   * Closes the clan chat window in the Steam client. This changes what the user sees.
   * @param clanChatId64 - The chat room's SteamID64, as a BigInt
   * @returns true if Steam closed it
   */
  export function closeClanChatWindowInSteam(clanChatId64: bigint): boolean
  /**
   * Turns on or off the interception of friend-to-friend chat messages. While it is on, the game gets them through the `GameConnectedFriendChatMsg` callback and reads them with `getFriendMessage`, and the Steam client does not show them.
   * @param enabled - `true` to intercept, `false` to restore the Steam client's own handling
   * @returns true if Steam accepted the change
   */
  export function setListenForFriendsMessages(enabled: boolean): boolean
  /**
   * Sends a chat message to a friend. The message is delivered to the friend.
   * Throws when `text` contains a NUL character.
   * @param steamId64 - The friend's SteamID64, as a BigInt
   * @param text - The message text
   * @returns true if Steam accepted the message
   */
  export function replyToFriendMessage(steamId64: bigint, text: string): boolean
  /**
   * Reads a friend chat message. Use it after the `GameConnectedFriendChatMsg` callback, with that callback's `messageId`. Messages longer than 8192 bytes are cut.
   * @param steamId64 - The friend's SteamID64, as a BigInt
   * @param index - The message id from the `GameConnectedFriendChatMsg` callback
   * @returns the `ChatMessage` (its `chatter` is the friend), or `null` when Steam returns a negative length (unverified against a live Steam client)
   */
  export function getFriendMessage(steamId64: bigint, index: number): ChatMessage | null
  /**
   * Asks Steam how many users follow a user. Resolves with the count; the request is driven by `runCallbacks()`.
   * Rejects when no answer arrives or Steam reports an error.
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @returns the number of followers
   */
  export function getFollowerCount(steamId64: bigint): Promise<number>
  /**
   * Asks Steam whether the local user follows a user. Resolves with the answer; the request is driven by `runCallbacks()`.
   * Rejects when no answer arrives or Steam reports an error.
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @returns true if the local user follows the user
   */
  export function isFollowing(steamId64: bigint): Promise<boolean>
  /**
   * Asks Steam for one page of the users the local user follows. Resolves with the page; the request is driven by `runCallbacks()`.
   * Rejects when no answer arrives or Steam reports an error.
   * @param startIndex - Index of the first user on the page, from `0`
   * @returns the page: `steamIds` (at most 50 SteamID64s) and `totalCount`, the size of the whole list
   */
  export function enumerateFollowingList(startIndex: number): Promise<FollowingPage>
  /**
   * Asks Steam which Community profile items a user has equipped. Resolves once Steam has answered; the request is driven by `runCallbacks()`. Read the items with `hasEquippedProfileItem` and the property functions after it resolves.
   * Rejects when no answer arrives or Steam reports an error.
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @returns the equipped flags and `fromCache`
   */
  export function requestEquippedProfileItems(steamId64: bigint): Promise<EquippedProfileItems>
  /**
   * Returns whether a user has equipped a profile item of that kind. Valid only after `requestEquippedProfileItems` has resolved for that user.
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @param itemType - The kind of profile item (`ProfileItemType`)
   * @returns true if the user has one equipped
   */
  export function hasEquippedProfileItem(steamId64: bigint, itemType: ProfileItemType): boolean
  /**
   * Returns a text property of an equipped profile item. Valid only after `requestEquippedProfileItems` has resolved for that user.
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @param itemType - The kind of profile item (`ProfileItemType`)
   * @param property - The property to read (`ProfileItemProperty`)
   * @returns the value, or `null` when Steam has none
   */
  export function getProfileItemPropertyString(steamId64: bigint, itemType: ProfileItemType, property: ProfileItemProperty): string | null
  /**
   * Returns a number property of an equipped profile item (`AppId`, `TypeId` or `Class`). Valid only after `requestEquippedProfileItems` has resolved for that user.
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @param itemType - The kind of profile item (`ProfileItemType`)
   * @param property - The property to read (`ProfileItemProperty`)
   * @returns the value, or `0` when Steam has none
   */
  export function getProfileItemPropertyUint(steamId64: bigint, itemType: ProfileItemType, property: ProfileItemProperty): number
  /**
   * Asks Steam for a user's Rich Presence. Steam posts the `FriendRichPresenceUpdate` callback when the data arrives; read it with `getFriendRichPresence` after that.
   * @param steamId64 - The user's SteamID64, as a BigInt
   */
  export function requestFriendRichPresence(steamId64: bigint): void
  /**
   * Returns the Rich Presence value a user has set for a key (for example `status`).
   * Throws when `key` contains a NUL character.
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @param key - The Rich Presence key
   * @returns the value, or `null` when the user has not set the key
   */
  export function getFriendRichPresence(steamId64: bigint, key: string): string | null
  /**
   * Returns how many Rich Presence keys a user currently has, for listing them with `getFriendRichPresenceKey`.
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @returns the number of keys
   */
  export function getFriendRichPresenceKeyCount(steamId64: bigint): number
  /**
   * Returns a Rich Presence key of a user by its index (typically used for debugging).
   * @param steamId64 - The user's SteamID64, as a BigInt
   * @param index - Index from `0` to `getFriendRichPresenceKeyCount` minus one
   * @returns the key name, or `null` when there is none at that index
   */
  export function getFriendRichPresenceKey(steamId64: bigint, index: number): string | null
  /**
   * Downloads activity counts for clans the local user is not a member of. Resolves when Steam has answered; the request is driven by `runCallbacks()`. Afterwards `getClanActivityCounts` and `getClans` return the counts.
   * Rejects when no answer arrives or Steam reports failure.
   * @param clanIds - The clans' SteamID64s, as BigInts
   */
  export function downloadClanActivityCounts(clanIds: Array<bigint>): Promise<void>
  /**
   * Asks Steam for a clan's officer list, which gives the owner and the officers. Only a member of the clan can ask. Resolves with the number of officers, the owner included; the request is driven by `runCallbacks()`.
   * Rejects when no answer arrives or Steam reports failure.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns the number of officers, the owner included
   */
  export function requestClanOfficerList(steamId64: bigint): Promise<number>
  /**
   * Returns a clan with its owner and officers. It asks Steam for the officer list first, so it resolves after the officer list has arrived; the request is driven by `runCallbacks()`.
   * Rejects when no answer arrives or Steam reports failure. Use `getClans` to read many clans without this request.
   * @param steamId64 - The clan's SteamID64, as a BigInt
   * @returns the `ClanInfo` with name, tag, activity counts, owner and officers
   */
  export function getClanInfo(steamId64: bigint): Promise<ClanInfo>
}
export declare namespace http {
  /** Options for `request()`. Only `method` and `url` are required. */
  export interface RequestOptions {
    /** HTTP method: `GET`, `HEAD`, `POST`, `PUT`, `DELETE`, `OPTIONS` or `PATCH`, in any letter case. */
    method: string
    /** Absolute URL. It must start with `http://` or `https://`. */
    url: string
    /** Request headers, by name. Steam may reject a header name or value it does not accept. */
    headers?: Record<string, string>
    /** GET parameters. Steam adds them to the URL for a `GET` request, and they are sent as form data for other methods. */
    query?: Record<string, string>
    /** POST parameters, sent form-encoded. Steam sends them the same way as `query` for non-GET methods. Cannot be combined with `body`. */
    form?: Record<string, string>
    /** Raw request body, for `POST` (and methods Steam accepts a body for). Cannot be combined with `form` or `query`. */
    body?: Buffer
    /** `Content-Type` of `body`. Defaults to `application/octet-stream`, and is only allowed together with `body`. */
    contentType?: string
    /** Total time limit for the request, in milliseconds. Unlike the network inactivity timeout, it does not reset when data arrives. Steam's default is no total limit. */
    timeoutMs?: number
    /** Text appended to the user agent. The normal user agent is kept. */
    userAgent?: string
    /** Whether HTTPS certificates must be verified. Defaults to `true`. Turning it off is unverified against a live Steam client. */
    requireVerifiedCertificate?: boolean
    /** Cookie container from `createCookieContainer()`, to send and store cookies with this request. */
    cookieContainer?: CookieContainer
    /** Names of the response headers to return in `headers`. Steam has no way to list all response headers, so name each one you need. */
    responseHeaders?: Array<string>
  }
  /** A completed request. `request()` resolves with it when the server answered, whatever the status code. */
  export interface HttpResponse {
    /** HTTP status code the server returned, for example `200` or `404`. Check it yourself: error statuses still resolve. */
    status: number
    /** The headers named in `responseHeaders` that the response contains, with names as you wrote them. */
    headers: Record<string, string>
    /** Response body bytes. Empty for `HEAD` requests and for responses without a body. */
    body: Buffer
    /** `true` when the request timed out. A timeout normally rejects the promise instead, so this is `false` on a resolved response. */
    wasTimedOut: boolean
  }
  /**
   * Creates a cookie container that requests can share. Needs `init()`.
   * @param allowResponsesToModify - When `true`, responses to requests using the container may add cookies that are sent with later requests. When `false`, only cookies added with `setCookie()` are sent.
   * @returns The new container. Throws when Steam returns no handle.
   */
  export function createCookieContainer(allowResponsesToModify: boolean): CookieContainer
  /**
   * Sends an HTTP request through the Steam client and resolves with the response. Needs `init()`, and the Steam client must be running.
   * The request is driven by `runCallbacks()`, so call it regularly while the promise is pending. The request handle is released on every path, including failures.
   *
   * The promise rejects when the request cannot be created or sent, when a header or option is refused, when Steam cannot complete the request, when no answer comes from the server, or when the request times out.
   * It resolves for every answer the server gives, including error statuses such as 404 or 500.
   * Requests are sent through the Steam client. Whether HTTPS validation behaves the same as in a browser is unverified against a live Steam client.
   * @param options - The request. `method` and `url` are required.
   * @returns The response with its status, the requested headers and the body.
   */
  export function request(options: RequestOptions): Promise<HttpResponse>
  /**
   * A cookie container for requests. Cookies stay in the Steam client for this process only and are not saved between runs.
   * It is released when it is no longer referenced by JavaScript and no request is still using it.
   */
  export class CookieContainer {
    /**
     * Adds a cookie that requests using this container send to `url`. Needs `init()`.
     * @param host - The host the cookie belongs to, for example `example.com`.
     * @param url - The URL the cookie applies to, starting with `http://` or `https://`.
     * @param cookie - A `Set-Cookie`-style value, for example `session=abc; Path=/`.
     * @returns Throws when an argument contains a NUL character or Steam refuses the cookie.
     */
    setCookie(host: string, url: string, cookie: string): void
  }
}
export declare namespace input {
  export const enum InputType {
    Unknown = 'Unknown',
    SteamController = 'SteamController',
    XBox360Controller = 'XBox360Controller',
    XBoxOneController = 'XBoxOneController',
    GenericGamepad = 'GenericGamepad',
    PS4Controller = 'PS4Controller',
    AppleMFiController = 'AppleMFiController',
    AndroidController = 'AndroidController',
    SwitchJoyConPair = 'SwitchJoyConPair',
    SwitchJoyConSingle = 'SwitchJoyConSingle',
    SwitchProController = 'SwitchProController',
    MobileTouch = 'MobileTouch',
    PS3Controller = 'PS3Controller',
    PS5Controller = 'PS5Controller',
    SteamDeckController = 'SteamDeckController'
  }
  export interface AnalogActionVector {
    x: number
    y: number
  }
  /**
   * Initializes Steam Input. Call it before reading controllers or action data.
   * Steam Input is updated from the Steam callback loop (`SteamAPI_RunCallbacks()`), not by a separate per-frame call.
   * Requires a running Steam client.
   */
  export function init(): void
  /**
   * Lists the controllers Steam Input currently sees as connected.
   * @returns a `Controller` for each connected controller, or an empty array when none are connected
   */
  export function getControllers(): Array<Controller>
  /**
   * Looks up the handle of an action set defined in the game's Steam Input configuration.
   * @param actionSetName - name of the action set, as it is defined in the Steam Input configuration
   * @returns the action set handle as a BigInt. Unverified against a live Steam client: a name that is not found is expected to return `0`.
   */
  export function getActionSet(actionSetName: string): bigint
  /**
   * Looks up the handle of a digital action defined in the game's Steam Input configuration.
   * @param actionName - name of the digital action, as it is defined in the Steam Input configuration
   * @returns the action handle as a BigInt. Unverified against a live Steam client: a name that is not found is expected to return `0`.
   */
  export function getDigitalAction(actionName: string): bigint
  /**
   * Looks up the handle of an analog action defined in the game's Steam Input configuration.
   * @param actionName - name of the analog action, as it is defined in the Steam Input configuration
   * @returns the action handle as a BigInt. Unverified against a live Steam client: a name that is not found is expected to return `0`.
   */
  export function getAnalogAction(actionName: string): bigint
  /** Shuts down Steam Input. Call `init` again before using controllers or actions after this. */
  export function shutdown(): void
  export interface DigitalActionData {
    /** `true` while the digital action is pressed. */
    state: boolean
    /** `false` when the action is not available for this controller. */
    active: boolean
  }
  export interface AnalogActionData {
    x: number
    y: number
    /** `false` when the action is not available for this controller. */
    active: boolean
  }
  /**
   * @param controllerHandle - a controller handle from `getConnectedControllers`
   * @param actionHandle - a digital action handle from `getDigitalAction`
   */
  export function getDigitalActionData(controllerHandle: bigint, actionHandle: bigint): DigitalActionData
  /** @param actionHandle - an analog action handle from `getAnalogAction` */
  export function getAnalogActionData(controllerHandle: bigint, actionHandle: bigint): AnalogActionData
  /** @returns the Steam action origins (numeric `EInputActionOrigin` values) bound to a digital action; empty when unbound */
  export function getDigitalActionOrigins(controllerHandle: bigint, actionSetHandle: bigint, actionHandle: bigint): Array<number>
  /** @returns the Steam action origins (numeric `EInputActionOrigin` values) bound to an analog action; empty when unbound */
  export function getAnalogActionOrigins(controllerHandle: bigint, actionSetHandle: bigint, actionHandle: bigint): Array<number>
  /** @returns the display name of an action origin, such as "A Button"; empty for an unknown origin */
  export function getStringForActionOrigin(origin: number): string
  /** @returns the glyph image path of an action origin */
  export function getGlyphForActionOrigin(origin: number): string
  export class Controller {
    /**
     * Switches this controller to an action set. The call is cheap and can be repeated safely.
     * @param actionSetHandle - action set handle from `getActionSet`
     */
    activateActionSet(actionSetHandle: bigint): void
    /**
     * Checks whether a digital action is pressed on this controller.
     * @param actionHandle - digital action handle from `getDigitalAction`
     * @returns `true` while the action is pressed, otherwise `false`
     */
    isDigitalActionPressed(actionHandle: bigint): boolean
    /**
     * Reads the current vector of an analog action on this controller.
     * @param actionHandle - analog action handle from `getAnalogAction`
     * @returns `x` and `y` as reported by Steam Input. Unverified against a live Steam client: the value ranges are not checked here.
     */
    getAnalogActionVector(actionHandle: bigint): AnalogActionVector
    /**
     * Identifies the type of this controller.
     * @returns the controller's `InputType`, `Unknown` when Steam cannot identify it
     */
    getType(): InputType
    /**
     * Returns the Steam Input handle of this controller.
     * @returns the handle as a BigInt, the value used by controller-scoped Steam Input calls
     */
    getHandle(): bigint
  }
}
export declare namespace inventory {
  /** One item instance of an inventory result. */
  export interface ItemDetails {
    /** The globally unique id of this item instance. It is a `bigint` because it can exceed 2^53, and it is never reused for another item. */
    itemId: bigint
    /** The item definition id, a number between 1 and 999999999. */
    definition: number
    /** The stack size of the item. */
    quantity: number
    /** Status and action flags: `1` cannot be traded, `256` was removed (destroyed, traded away or expired), `512` was consumed by one `consumeItem` call. */
    flags: number
  }
  /** The items of a finished inventory result. */
  export interface InventoryResultData {
    /** The item instances in the result. Empty when the result holds no items. */
    items: Array<ItemDetails>
    /** The server time at which Steam generated the result, in Unix seconds (unverified against a live Steam client). */
    timestamp: number
    /** `true` when Steam marked the result as possibly out of date (for example after an item was traded or consumed). The items are still valid to read. */
    expired: boolean
  }
  /** A definition quantity pair, used to grant, generate or exchange items. */
  export interface ItemQuantity {
    /** The item definition id, a number between 1 and 999999999. */
    definition: number
    /** How many items of that definition to use or create. */
    quantity: number
  }
  /** An item instance quantity pair, used to consume, exchange or trade items the user already has. */
  export interface ItemInstanceQuantity {
    /** The instance id of the item, as in `ItemDetails.itemId`. */
    itemId: bigint
    /** How many of that item to use. */
    quantity: number
  }
  /** An item definition with all of its string properties. */
  export interface ItemDefinition {
    /** The item definition id. */
    id: number
    /** Every property the definition has, by name. Some values (such as `name`) are localized for the current Steam language. A property whose value cannot be read is left out. */
    properties: Record<string, string>
  }
  /** The price of one item definition, in the currency that `requestPrices()` reported. */
  export interface ItemPrice {
    /** The item definition id. */
    definition: number
    /** The current price, after any sale, in the currency's smallest unit (unverified against a live Steam client). A `bigint` because it can exceed 2^53. */
    currentPrice: bigint
    /** The base price, without any sale, in the same unit as `currentPrice`. */
    basePrice: bigint
  }
  /** The answer to `requestPrices()`. */
  export interface PricesReceived {
    /** The currency code the prices are in, for example `USD`, as Steam reports it. */
    currency: string
  }
  /** The answer to `requestEligiblePromoItems()`. */
  export interface EligiblePromoItems {
    /** The item definition ids the user can be granted manually with `addPromoItem()`. */
    itemDefinitions: Array<number>
    /** `true` when Steam answered from its cache instead of the server. */
    cached: boolean
  }
  /** The answer to `startPurchase()`. The purchase itself is completed by the user in the Steam overlay. */
  export interface PurchaseStarted {
    /** The order id Steam assigned to the purchase, as a `bigint`. */
    orderId: bigint
    /** The transaction id Steam assigned to the purchase, as a `bigint`. */
    transactionId: bigint
  }
  /**
   * Captures the whole inventory of the current user. Resolves with its items.
   *
   * Steam may rate-limit this and return a cached copy, so call it when the inventory is about to be shown, not on every frame. Read-only: it changes nothing.
   * Rejects when Steam cannot start the query, when it reports an error, or when no answer arrives in time.
   *
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the items of the inventory and the time Steam generated them.
   */
  export function getAllItems(timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Captures the state of some items of the current user, by instance id. Resolves with those items only.
   *
   * Read-only. The result can be serialized with `serializeItems()` and checked by another player.
   * Rejects when an id is negative or too large, when Steam reports an error, or when no answer arrives in time.
   *
   * @param itemIds - The instance ids of the items to read, as `bigint` values.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the requested items that the user owns.
   */
  export function getItemsById(itemIds: Array<bigint>, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Serializes the named items into a signed buffer, so that another player can verify ownership with `deserializeResult()`.
   *
   * Read-only. It builds a small result with `getItemsByID`, as the SDK recommends, and then serializes it. Steam marks the buffer `expired` after one hour; the check in `deserializeResult()` then still returns the items, with `expired` set.
   * Rejects when an id is invalid, when Steam reports an error, or when no answer arrives in time.
   *
   * @param itemIds - The instance ids of the items to prove, as `bigint` values.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the serialized, signed result.
   */
  export function serializeItems(itemIds: Array<bigint>, timeoutMs?: number | undefined | null): Promise<Buffer>
  /**
   * Checks a buffer made by `serializeItems()` and reads the items in it. This runs synchronously and does not wait for Steam.
   *
   * Read-only. Returns `null` when Steam rejects the buffer (for example because it was altered), when Steam is offline and needs a full online check, or when the items belong to a different user than `expectedSteamId`. Always pass the id of the player who sent the buffer, so that nobody can pass off another player's items.
   *
   * @param data - The buffer received from another player.
   * @param expectedSteamId - The 64-bit Steam id of the player who should own the items, as a `bigint`.
   * @returns the verified items with `expired` set when the buffer is out of date, or `null` when verification fails.
   */
  export function deserializeResult(data: Buffer, expectedSteamId: bigint): InventoryResultData | null
  /**
   * Creates new items in the user's inventory. Resolves with the created items.
   *
   * This changes the user's real inventory. Steam accepts it only from accounts in the game's publisher group, and only for prototyping.
   * Rejects when Steam refuses the request, reports an error, or sends no answer in time.
   *
   * @param items - The item definitions to create, with their quantities.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the items that Steam created.
   */
  export function generateItems(items: Array<ItemQuantity>, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Grants the promotional items the user is eligible for, once only. Resolves with the granted items.
   *
   * This changes the user's real inventory. Being eligible for no promotion still resolves, with an empty list.
   * Rejects when Steam reports an error or sends no answer in time.
   *
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the promotional items that were granted.
   */
  export function grantPromoItems(timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Grants one promotional item definition, if the user is eligible for it. Resolves with the granted items.
   *
   * This changes the user's real inventory. Use `requestEligiblePromoItems()` to see which definitions can be granted.
   * Rejects when Steam refuses the grant, reports an error or sends no answer in time.
   *
   * @param definition - The promotional item definition id.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the items that were granted.
   */
  export function addPromoItem(definition: number, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Grants several promotional item definitions, if the user is eligible for them. Only the listed definitions are checked.
   *
   * This changes the user's real inventory. Rejects when Steam refuses the grant, reports an error or sends no answer in time.
   *
   * @param definitions - The promotional item definition ids.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the items that were granted.
   */
  export function addPromoItems(definitions: Array<number>, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Permanently removes items from the user's inventory. The items cannot be recovered. Resolves with the inventory after the change.
   *
   * This changes the user's real inventory and cannot be undone. Ask the user to confirm before calling it. Rejects when the id is invalid, Steam reports an error, or no answer arrives in time.
   *
   * @param itemId - The instance id of the item, as a `bigint`.
   * @param quantity - How many of the item to remove.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the result, which holds the consumed item with its `ITEM_FLAG_CONSUMED` flag set.
   */
  export function consumeItem(itemId: bigint, quantity: number, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Atomically destroys some items and creates others, following the exchange recipe set in Steamworks (for example crafting or opening a chest). Resolves with the result.
   *
   * This changes the user's real inventory and cannot be undone. Steam fails the whole exchange when the items do not match a recipe. Ask the user to confirm before calling it.
   * Rejects when Steam refuses the exchange, reports an error or sends no answer in time.
   *
   * @param generate - The item definitions to create, with their quantities.
   * @param destroy - The owned items to use up, with their quantities.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the result of the exchange, which holds the created items.
   */
  export function exchangeItems(generate: Array<ItemQuantity>, destroy: Array<ItemInstanceQuantity>, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Moves quantity between two stacks of the same item, or splits a stack into a new item when `destination` is `null`. Resolves with the result.
   *
   * This changes the user's real inventory. Only stackable items can be split or merged.
   * Rejects when Steam refuses the transfer, reports an error or sends no answer in time.
   *
   * @param source - The instance id of the stack to take quantity from, as a `bigint`.
   * @param quantity - How much to move.
   * @param destination - The instance id of the stack to add to, as a `bigint`, or `null` to split off a new item.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the result of the transfer.
   */
  export function transferItemQuantity(source: bigint, quantity: number, destination?: bigint | undefined | null, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /** Deprecated by Steam: sending a drop heartbeat is no longer required for playtime accounting. This does nothing that Steam still uses. */
  export function sendItemDropHeartbeat(): void
  /**
   * Turns playtime credit into an item drop from a drop list definition. Resolves with the result, which is empty when there is not enough playtime credit.
   *
   * This changes the user's real inventory. Only definitions marked as playtime item generators in Steamworks can drop. Players can modify their client, so do not use the definition to control rarity.
   * Rejects when Steam reports an error or sends no answer in time.
   *
   * @param dropListDefinition - The drop list definition id.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the items that dropped, which may be none.
   */
  export function triggerItemDrop(dropListDefinition: number, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Deprecated by Steam: the SDK documents trading through the inventory as not supported. The call is wrapped for completeness and is expected to reject. Unverified against a live Steam client.
   *
   * If Steam does accept it, this changes the user's real inventory by trading items with `partner`.
   *
   * @param partner - The Steam id of the trade partner, as a `bigint`.
   * @param give - The items the user gives, with their quantities.
   * @param get - The items the user receives, with their quantities.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the result of the trade.
   */
  export function tradeItems(partner: bigint, give: Array<ItemInstanceQuantity>, get: Array<ItemInstanceQuantity>, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * Starts loading and refreshing the item definitions. Returns `false` when the load cannot start.
   *
   * The definitions are complete only after Steam's definition update callback, so read `getItemDefinitions()` after that, not right after this call. Read-only.
   *
   * @returns `true` when the load started, otherwise `false`.
   */
  export function loadItemDefinitions(): boolean
  /**
   * Returns the ids of all item definitions set up in Steamworks. Returns `null` when Steam refuses the call, for example before the definitions are loaded.
   *
   * Read-only. The ids are not necessarily contiguous.
   *
   * @returns the item definition ids.
   */
  export function getItemDefinitionIds(): Array<number> | null
  /**
   * Returns every item definition with all of its properties. Returns `null` when Steam refuses to list the ids.
   *
   * Read-only. It reads each definition's properties one by one, so call it once and keep the result. Run it after the definitions are loaded.
   *
   * @returns each definition id with a record of its properties.
   */
  export function getItemDefinitions(): Array<ItemDefinition> | null
  /**
   * Returns one string property of an item definition, or `null` when it is unknown or cannot be read.
   *
   * Read-only. Some properties, such as `name`, are localized for the current Steam language.
   *
   * @param definition - The item definition id.
   * @param name - The property name, made of ASCII letters, digits and underscores.
   * @returns the property value, or `null`.
   */
  export function getItemDefinitionProperty(definition: number, name: string): string | null
  /**
   * Asks Steam which promotional item definitions the user can be granted manually. Resolves with their ids.
   *
   * Read-only: this does not change the inventory. Grant one of them with `addPromoItem()`.
   * Rejects when Steam reports an error or sends no answer in time.
   *
   * @param steamId - The 64-bit Steam id of the user, as a `bigint`.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the eligible item definition ids and whether they came from the cache.
   */
  export function requestEligiblePromoItems(steamId: bigint, timeoutMs?: number | undefined | null): Promise<EligiblePromoItems>
  /**
   * Starts buying item definitions. Resolves with the order and transaction ids once Steam has opened the purchase.
   *
   * This is a real purchase that charges the user. The user confirms it in the Steam overlay; the final purchase result arrives later as Steam's result-ready callback, not through this promise.
   * Rejects when Steam cannot start the transaction, reports an error or sends no answer in time.
   *
   * @param items - The item definitions to buy, with their quantities.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the order id and transaction id Steam assigned.
   */
  export function startPurchase(items: Array<ItemQuantity>, timeoutMs?: number | undefined | null): Promise<PurchaseStarted>
  /**
   * Asks Steam for the current prices of the item definitions. Resolves with the currency of the prices.
   *
   * Read-only. Call it before `getItemsWithPrices()` or `getItemPrice()`.
   * Rejects when Steam reports an error or sends no answer in time.
   *
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the currency code of the prices.
   */
  export function requestPrices(timeoutMs?: number | undefined | null): Promise<PricesReceived>
  /**
   * Returns how many item definitions have a price. Call `requestPrices()` first.
   *
   * Read-only. Returns `0` before the prices are requested.
   *
   * @returns the number of item definitions with a price.
   */
  export function getNumItemsWithPrices(): number
  /**
   * Returns the prices of all item definitions that have one. Returns `null` when Steam refuses to list them, for example before `requestPrices()` completes.
   *
   * Read-only. Prices are in the smallest unit of the currency from `requestPrices()`.
   *
   * @returns the price of each item definition that has one.
   */
  export function getItemsWithPrices(): Array<ItemPrice> | null
  /**
   * Returns the price of one item definition. Returns `null` when Steam stores no price for it.
   *
   * Read-only. Call `requestPrices()` first.
   *
   * @param definition - The item definition id.
   * @returns the current and base price, or `null`.
   */
  export function getItemPrice(definition: number): ItemPrice | null
  /**
   * Starts a batch of item property changes. Returns `null` when Steam refuses to start one.
   *
   * Add changes with the set and remove methods, then send the batch with `submit()`. Nothing changes until `submit()` resolves.
   *
   * @returns a new property update batch, or `null`.
   */
  export function startUpdateProperties(): InventoryPropertyUpdate | null
  /**
   * Asks Steam to fetch the item described by an inspection token, such as one from an item link. Resolves with the item.
   *
   * Read-only. Rejects when the token is invalid, Steam reports an error or sends no answer in time.
   *
   * @param token - The inspection token, as text.
   * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
   * @returns the inspected item.
   */
  export function inspectItem(token: string, timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  /**
   * A batch of item property changes. Create it with `startUpdateProperties()`, add changes with the set and
   * remove methods, then send it with `submit()`. Nothing changes until `submit()` resolves.
   */
  export class InventoryPropertyUpdate {
    /**
     * Sets a string property on an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name or value contains a NUL character.
     *
     * Nothing changes until `submit()` resolves.
     *
     * @param itemId - The instance id of the item, as a `bigint`.
     * @param name - The property name, made of ASCII letters, digits and underscores.
     * @param value - The new string value.
     */
    setString(itemId: bigint, name: string, value: string): void
    /**
     * Sets a boolean property on an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name contains a NUL character.
     *
     * @param itemId - The instance id of the item, as a `bigint`.
     * @param name - The property name, made of ASCII letters, digits and underscores.
     * @param value - The new boolean value.
     */
    setBool(itemId: bigint, name: string, value: boolean): void
    /**
     * Sets a 64-bit integer property on an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name contains a NUL character.
     *
     * @param itemId - The instance id of the item, as a `bigint`.
     * @param name - The property name, made of ASCII letters, digits and underscores.
     * @param value - The new value, as a `bigint` between -2^63 and 2^63 - 1.
     */
    setInt64(itemId: bigint, name: string, value: bigint): void
    /**
     * Sets a float property on an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name contains a NUL character.
     *
     * The value is stored as a 32-bit float, so precision beyond about seven digits is lost.
     *
     * @param itemId - The instance id of the item, as a `bigint`.
     * @param name - The property name, made of ASCII letters, digits and underscores.
     * @param value - The new value.
     */
    setFloat(itemId: bigint, name: string, value: number): void
    /**
     * Removes a property from an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name contains a NUL character.
     *
     * @param itemId - The instance id of the item, as a `bigint`.
     * @param name - The property name to remove.
     */
    remove(itemId: bigint, name: string): void
    /**
     * Sends the batch to Steam and changes the item properties of the user's real inventory. This cannot be undone. Resolves with the updated items.
     *
     * The batch can be submitted only once. Rejects when the batch was already submitted, when Steam refuses it, reports an error, or sends no answer in time. After a timeout the outcome is unknown, so check the inventory before retrying.
     *
     * @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
     * @returns the items after the change, as Steam returns them.
     */
    submit(timeoutMs?: number | undefined | null): Promise<InventoryResultData>
  }
}
export declare namespace leaderboard {
  export const enum LeaderboardSortMethod {
    Ascending = 0,
    Descending = 1
  }
  export const enum LeaderboardDisplayType {
    Numeric = 0,
    TimeSeconds = 1,
    TimeMilliSeconds = 2
  }
  export const enum LeaderboardDataRequest {
    Global = 0,
    GlobalAroundUser = 1,
    Friends = 2
  }
  export const enum UploadScoreMethod {
    /** Keeps the better of the existing score and the new one. */
    KeepBest = 0,
    /** Replaces the existing score, even when it is worse. */
    ForceUpdate = 1
  }
  export interface LeaderboardScoreUploaded {
    /** The score Steam stored for the user. */
    score: number
    /** `false` when the uploaded score did not replace the existing one. */
    wasChanged: boolean
    globalRankNew: number
    globalRankPrevious: number
  }
  export interface LeaderboardEntry {
    steamId64: bigint
    globalRank: number
    score: number
    details: Array<number>
  }
  /**
   * Finds a leaderboard by name.
   * @returns the leaderboard, or `null` when no leaderboard has that name
   */
  export function find(name: string): Promise<Leaderboard | null>
  /**
   * Finds a leaderboard by name, creating it with the given sort method and display type when it does not exist.
   * @returns the leaderboard, or `null` when Steam could not find or create it
   */
  export function findOrCreate(name: string, sortMethod: LeaderboardSortMethod, displayType: LeaderboardDisplayType): Promise<Leaderboard | null>
  /** A leaderboard handle returned by `find` or `findOrCreate`. */
  export class Leaderboard {
    /** @returns the leaderboard name */
    getName(): string
    /** @returns the number of entries on the leaderboard */
    getEntryCount(): number
    /** @returns the sort method, or `null` when Steam does not report one */
    getSortMethod(): LeaderboardSortMethod | null
    /** @returns the display type, or `null` when Steam does not report one */
    getDisplayType(): LeaderboardDisplayType | null
    /**
     * Uploads a score for the local user.
     * @param details - integers stored with the score alongside it
     * @returns the result, or `null` when Steam reports that the upload did not succeed
     */
    uploadScore(method: UploadScoreMethod, score: number, details: Array<number>): Promise<LeaderboardScoreUploaded | null>
    /**
     * Downloads leaderboard entries for a range of ranks.
     * @param start - first rank index (0-based) in the requested range
     * @param end - last rank index (exclusive) in the requested range
     * @param maxDetails - maximum number of detail integers returned per entry
     */
    downloadEntries(request: LeaderboardDataRequest, start: number, end: number, maxDetails: number): Promise<Array<LeaderboardEntry>>
    /**
     * Attaches a piece of cloud content to the local user's entry on this leaderboard. This changes the user's leaderboard data on Steam.
     * @param ugcHandle - the UGC handle of the content, as a BigInt (for example the value returned by `cloud.shareFile()`)
     * @returns resolves when Steam accepts the attachment; rejects with Steam's error otherwise, or when the handle is not a valid 64-bit value
     */
    attachUgc(ugcHandle: bigint): Promise<void>
    /**
     * Downloads the leaderboard entries of the given users only. A user with no entry on this leaderboard is left out of the result.
     * Steam accepts at most 100 users per request and only one such request at a time; this binding rejects more than 100 before it calls Steam.
     * @param steamIds64 - the users' 64-bit SteamIDs, at most 100
     * @param maxDetails - maximum number of detail integers returned per entry
     * @returns the entries Steam returns, in Steam's order
     */
    downloadEntriesForUsers(steamIds64: Array<bigint>, maxDetails: number): Promise<Array<LeaderboardEntry>>
  }
}
export declare namespace localplayer {
  /** Result of a voice call, from Steam's `EVoiceResult`. The values are the SDK numbers. */
  export const enum VoiceResult {
    Ok = 0,
    NotInitialized = 1,
    /** Voice is not recording. `getVoice()` returns this once a stopped recording has no audio left. */
    NotRecording = 2,
    NoData = 3,
    /** The destination buffer is too small. */
    BufferTooSmall = 4,
    DataCorrupted = 5,
    Restricted = 6,
    UnsupportedCodec = 7,
    ReceiverOutOfDate = 8,
    ReceiverDidNotAnswer = 9,
    /** A value this binding does not name. */
    Unknown = -1
  }
  /** Playtime progress for duration control, from Steam's `EDurationControlProgress`. `Half` and `NoProgress` are deprecated in the SDK. */
  export const enum DurationControlProgress {
    /** Full progress. */
    Full = 0,
    /** Deprecated: XP or persistent rewards should be halved. */
    Half = 1,
    /** Deprecated: XP or persistent rewards should be stopped. */
    NoProgress = 2,
    /** The allowed 3 hours since the 5-hour gap have passed; the game should exit. */
    ExitSoon3h = 3,
    /** The allowed 5 hours in the calendar day have passed; the game should exit. */
    ExitSoon5h = 4,
    /** The game runs after the day period; it should exit. */
    ExitSoonNight = 5,
    /** A value this binding does not name. */
    Unknown = -1
  }
  /** Which duration control notification timer expired, from Steam's `EDurationControlNotification`. `ThreeHours`, `HalfProgress` and `NoProgress` are deprecated in the SDK. */
  export const enum DurationControlNotification {
    /** Progress information only; there is nothing to show. */
    NoNotification = 0,
    /** The user has been playing for an hour. */
    OneHour = 1,
    /** Deprecated: the user has been playing for 3 hours. */
    ThreeHours = 2,
    /** Deprecated: progress is half normal. */
    HalfProgress = 3,
    /** Deprecated: progress is zero. */
    NoProgress = 4,
    /** The allowed 3 hours since the 5-hour gap have passed; the game should exit. */
    ExitSoon3h = 5,
    /** The allowed 5 hours in the calendar day have passed; the game should exit. */
    ExitSoon5h = 6,
    /** The game runs after the day period; it should exit. */
    ExitSoonNight = 7,
    /** A value this binding does not name. */
    Unknown = -1
  }
  /** The online state of the game for duration control, from Steam's `EDurationControlOnlineState`. */
  export const enum DurationControlOnlineState {
    /** Offline play: single player, offline co-op and the like. Offline time does not count against playtime limits. */
    Offline = 1,
    /** Currently in online play. */
    Online = 2,
    /** Currently in online play and asking not to be interrupted. */
    OnlineHighPri = 3
  }
  /** Result of `getAvailableVoice()`. */
  export interface VoiceAvailable {
    /** `Ok` when the byte count is valid; otherwise the reason it is not. */
    result: VoiceResult
    /** Compressed bytes that `getVoice()` can return now. `0` when the result is not `Ok`. */
    compressedBytes: number
  }
  /** Result of `getVoice()` or `decompressVoice()`. */
  export interface VoiceChunk {
    /** The SDK result. */
    result: VoiceResult
    /** The bytes read or decoded. Empty unless `result` is `Ok` (or `NoData`/`BufferTooSmall`, which carry no data). */
    data: Buffer
  }
  /** Community Market status of the logged-in user, from Steam's `MarketEligibilityResponse_t`. */
  export interface MarketEligibility {
    /** Whether the user may use the Community Market. */
    allowed: boolean
    /** Bit flags of the reasons the user may not use the Market (SDK `EMarketNotAllowedReasonFlags`), `0` when allowed. Bit values: 1 temporary failure, 2 account disabled, 4 account locked down, 8 account limited, 16 trade banned, 32 account not trusted, 64 Steam Guard not enabled, 128 Steam Guard only recently enabled, 256 recent password reset, 512 new payment method, 1024 invalid cookie, 2048 using a new device, 4096 recent self refund, 8192 new payment method cannot be verified, 16384 no recent purchases, 32768 accepted wallet gift. */
    notAllowedReasons: number
    /** The time from which the user may use the Market, as the SDK's `RTime32` in seconds. The header names only the type, so the epoch is unverified against a live Steam client. */
    allowedAtTime: number
    /** Days of Steam Guard the user must have had before using the Market. */
    steamGuardRequiredDays: number
    /** Days after first authorizing a device before the user may use the Market on that device. */
    newDeviceCooldownDays: number
  }
  /** Duration control (playtime limit) status of the logged-in user, from Steam's `DurationControl_t`. */
  export interface DurationControl {
    /** The app that generated the playtime. */
    appId: number
    /** Whether duration control applies to this user and game. */
    applicable: boolean
    /** Playtime since the most recent 5-hour gap, in seconds, counted up to the regulatory limit. */
    secondsLast5H: number
    /** The recommended progress. */
    progress: DurationControlProgress
    /** The notification to show, if any. Always `NoNotification` for this call. */
    notification: DurationControlNotification
    /** Playtime on the current calendar day, in seconds. */
    secondsToday: number
    /** Playtime left before the user reaches a regulatory limit, in seconds. */
    secondsRemaining: number
  }
  /**
   * Returns the SteamID of the logged-in local user. Requires a running, logged-in Steam client.
   * @returns `steamId64` as a BigInt, `steamId32` as a string, and `accountId`
   */
  export function getSteamId(): PlayerSteamId
  /**
   * Returns the Steam display name of the local user. Requires a running Steam client.
   * @returns the persona name
   */
  export function getName(): string
  /**
   * Returns the Steam level of the local user. Requires a running Steam client.
   * @returns the Steam level
   */
  export function getLevel(): number
  /** @returns the 2 digit ISO 3166-1-alpha-2 format country code which client is running in, e.g. "US" or "UK". */
  export function getIpCountry(): string
  /**
   * Sets one Rich Presence value for the local user, visible to friends.
   * @param key - Rich Presence key
   * @param value - value to set; `null` or omitted removes the key
   */
  export function setRichPresence(key: string, value?: string | undefined | null): void
  /**
   * Returns the raw `HSteamUser` handle, the 32-bit value the SDK uses internally. Most code does not need it. Needs `init()`.
   * @returns the handle as a number.
   */
  export function getHSteamUser(): number
  /**
   * Reports a legacy usage event for a game to the Steam client. Needs `init()`. Only a few games use this call.
   * This sends data to Steam. The SDK header does not list the event numbers, so `event` is passed through unchanged; the mapping is unverified against a live Steam client.
   * Throws when `extraInfo` contains a NUL character, and then nothing is sent.
   * @param gameId - the raw `CGameID` as a BigInt; for a game without mods it is the app id.
   * @param event - the event number.
   * @param extraInfo - optional text sent with the event; empty when omitted.
   */
  export function trackAppUsageEvent(gameId: bigint, event: number, extraInfo?: string | undefined | null): void
  /**
   * Returns the local folder that Steam provides for the current account's data for this app, such as save games and configs. Needs `init()`.
   * @returns the folder path, or `null` when Steam returns none. The path form is the one in the SDK header: the Steam install folder, then `userdata`, the SteamID, the AppID and `local`, joined with the platform's path separator.
   */
  export function getUserDataFolder(): string | null
  /** Starts capturing voice from the microphone. Read the captured audio with `getVoice()` at least once per frame. Needs `init()`. */
  export function startVoiceRecording(): void
  /** Stops capturing voice. Steam keeps recording for a short time after this call, so keep calling `getVoice()` until its result is `VoiceResult.NotRecording`. */
  export function stopVoiceRecording(): void
  /**
   * Returns how many bytes of compressed voice data `getVoice()` can return now. Only compressed audio is used; the SDK's uncompressed (deprecated) output is never requested. Needs `init()`.
   * @returns `result`, and `compressedBytes`, which is `0` when the result is not `Ok`.
   */
  export function getAvailableVoice(): VoiceAvailable
  /**
   * Reads the compressed voice data captured since the last call. The buffer is sized from `getAvailableVoice()`, so the call returns what is available now. Needs `init()`.
   * Resolves with `result` and `data`. When `getAvailableVoice()` reports a result other than `Ok`, that result is returned with empty data. Throws only if the captured data is larger than 4 GB.
   * @returns `result`, and `data`, a Buffer of compressed bytes.
   */
  export function getVoice(): VoiceChunk
  /**
   * Decodes compressed voice data from `getVoice()` into raw single-channel 16-bit PCM. Needs `init()`.
   * The output buffer starts at 20 KB and is enlarged once when Steam asks for more room. The SDK supports sample rates from 11025 to 48000.
   * Throws when the input is larger than 4 GB.
   * @param compressed - the compressed voice bytes.
   * @param sampleRate - the output sample rate; `getVoiceOptimalSampleRate()` returns the decoder's native rate.
   * @returns `result`, and `data`, the decoded PCM bytes. The data is empty unless `result` is `Ok`.
   */
  export function decompressVoice(compressed: Buffer, sampleRate: number): VoiceChunk
  /**
   * Returns the native sample rate of the Steam voice decoder. Decoding at this rate does the least work; your audio output's own rate (often 44100 or 48000) can sound better. Needs `init()`.
   * @returns the sample rate in Hz.
   */
  export function getVoiceOptimalSampleRate(): number
  /**
   * Returns whether Steam thinks the logged-in user is behind a NAT device. Needs a connection to Steam (a `SteamServersConnected` callback has fired) and may not detect every form of NAT.
   * @returns true if Steam reports NAT, otherwise false.
   */
  export function isBehindNat(): boolean
  /**
   * Publishes a game server's address so friends can join this game. Steam replicates the data to friends. Needs `init()`.
   * This sends data to Steam. `ip` is passed as the 32-bit value of the IPv4 address (first octet in the highest byte). The header does not say which byte order the SDK expects, so this mapping is unverified against a live Steam client.
   * Throws when `gameServerSteamId` is not a valid BigInt or `ip` is not an IPv4 address.
   * @param gameServerSteamId - the game server's SteamID as a BigInt.
   * @param ip - the IPv4 address of the game server, such as "192.168.1.10".
   * @param port - the game server's port.
   */
  export function advertiseGame(gameServerSteamId: bigint, ip: string, port: number): void
  /**
   * Returns the logged-in user's trading-card badge level for a series. Needs `init()`.
   * The regular badge has a maximum level of 5 and the foil badge a maximum of 1 (from the SDK header). The header does not say which value means "no badge", so the value is passed through unverified.
   * @param series - the card series number.
   * @param foil - true for the foil badge, false for the regular badge.
   * @returns the badge level as the SDK reports it.
   */
  export function getGameBadgeLevel(series: number, foil: boolean): number
  /**
   * Returns whether the logged-in user's phone number is verified. Needs `init()`.
   * @returns true if verified, otherwise false.
   */
  export function isPhoneVerified(): boolean
  /**
   * Returns whether the logged-in user has two-factor authentication enabled. Needs `init()`.
   * @returns true if enabled, otherwise false.
   */
  export function isTwoFactorEnabled(): boolean
  /**
   * Returns whether the logged-in user's phone number is an identifying one. Needs `init()`.
   * @returns true if identifying, otherwise false.
   */
  export function isPhoneIdentifying(): boolean
  /**
   * Returns whether the logged-in user's phone number is waiting for (re)verification. Needs `init()`.
   * @returns true if verification is required, otherwise false.
   */
  export function isPhoneRequiringVerification(): boolean
  /**
   * Asks Steam whether the logged-in user may use the Community Market. Needs `init()`. Resolves once Steam has answered;
   * the answer is driven by `runCallbacks()`, which `init()` already calls.
   * There is no timeout: if Steam never answers, the Promise stays pending.
   * @returns the eligibility, including the reason flags and the cooldown fields.
   */
  export function getMarketEligibility(): Promise<MarketEligibility>
  /**
   * Asks Steam for the duration control (playtime limit) status of the logged-in user. Needs `init()`. Resolves once Steam has answered;
   * the answer is driven by `runCallbacks()`, which `init()` already calls.
   * Rejects when Steam reports an error. There is no timeout: if Steam never answers, the Promise stays pending. The `progress` and `notification` values can be deprecated ones (see their enums).
   * @returns the duration control status for the current app.
   */
  export function getDurationControl(): Promise<DurationControl>
  /**
   * Tells Steam's duration control system whether the game is in offline or online play. Offline play does not count against the playtime limits. Needs `init()`.
   * This sends the state to Steam.
   * @param state - the current online state of the game.
   * @returns true if the SDK accepted the state, otherwise false.
   */
  export function setDurationControlOnlineState(state: DurationControlOnlineState): boolean
}
export declare namespace matchmaking {
  export const enum LobbyType {
    Private = 0,
    FriendsOnly = 1,
    Public = 2,
    Invisible = 3
  }
  /**
   * Creates a new lobby and makes the local user its owner.
   * @param lobbyType - visibility of the lobby
   * @param maxMembers - maximum number of members; Steam rejects values above 250
   * @returns the new `Lobby`; rejects with Steam's error text when creation fails
   */
  export function createLobby(lobbyType: LobbyType, maxMembers: number): Promise<Lobby>
  /**
   * Joins a lobby by its ID.
   * @param lobbyId - lobby ID as a BigInt
   * @returns the joined `Lobby`; rejects with `Failed to join lobby` when Steam refuses the join
   */
  export function joinLobby(lobbyId: bigint): Promise<Lobby>
  /**
   * Requests the lobby list from Steam. The list follows the filters Steam applies by default. Unverified against a live Steam client.
   * @returns a `Lobby` for each lobby in the result; rejects with an error when the request fails
   */
  export function getLobbies(): Promise<Array<Lobby>>
  export class Lobby {
    id: bigint
    /**
     * Joins this lobby.
     * @returns a `Lobby` for the joined lobby; rejects with `Failed to join lobby` when Steam refuses the join
     */
    join(): Promise<Lobby>
    /** Leaves this lobby. */
    leave(): void
    /** Opens the Steam invite dialog for this lobby. */
    openInviteDialog(): void
    /**
     * Returns the number of members currently in this lobby.
     * @returns the member count
     */
    getMemberCount(): bigint
    /**
     * Returns the maximum number of members this lobby allows.
     * @returns the member limit, or `null` when Steam has no metadata for the lobby
     */
    getMemberLimit(): bigint | null
    /**
     * Returns the members of this lobby.
     * @returns a `PlayerSteamId` for each member, empty when there are none
     */
    getMembers(): Array<PlayerSteamId>
    /**
     * Returns the owner of this lobby.
     * @returns the owner's `PlayerSteamId`
     */
    getOwner(): PlayerSteamId
    /**
     * Sets whether new users may join this lobby. Only the lobby owner can change this.
     * @param joinable - `true` to allow joining, `false` to block it
     * @returns `true` when Steam accepted the change
     */
    setJoinable(joinable: boolean): boolean
    /**
     * Reads one metadata value of this lobby.
     * @param key - metadata key
     * @returns the value, or `null` when the key is not set
     */
    getData(key: string): string | null
    /**
     * Sets one metadata value of this lobby. Only the lobby owner can set lobby data.
     * @param key - metadata key
     * @param value - value to store
     * @returns `true` when Steam accepted the change
     */
    setData(key: string, value: string): boolean
    /**
     * Deletes one metadata value of this lobby. Only the lobby owner can delete lobby data.
     * @param key - metadata key to delete
     * @returns `true` when Steam accepted the change
     */
    deleteData(key: string): boolean
    /** Get an object containing all the lobby data */
    getFullData(): Record<string, string>
    /**
     * Merge current lobby data with provided data in a single batch
     * @returns true if all data was set successfully
     */
    mergeFullData(data: Record<string, string>): boolean
  }
}
export declare namespace matchmakingServers {
  /** Details of one game server. */
  export interface GameServerDetails {
    ip: string
    /** The game connection port. */
    port: number
    queryPort: number
    name: string
    map: string
    /** Players currently on the server. */
    players: number
    maxPlayers: number
    /** Latency in milliseconds. */
    ping: number
  }
  export interface PlayerDetails {
    name: string
    score: number
    /** Time played in seconds. */
    timePlayed: number
  }
  export interface ServerRule {
    key: string
    value: string
  }
  /**
   * Requests the internet server list for an app.
   * @param filters - Steam matchmaking filters, for example `{ gamedir: 'mygame' }`
   */
  export function internetServerList(appId: number, filters?: Record<string, string> | undefined | null): ServerListRequest
  /** Requests the list of servers the user has favourited for an app. */
  export function favoritesServerList(appId: number, filters?: Record<string, string> | undefined | null): ServerListRequest
  /** Requests the list of servers the user has played on recently for an app. */
  export function historyServerList(appId: number, filters?: Record<string, string> | undefined | null): ServerListRequest
  /** Requests the list of servers that the user's friends are playing on for an app. */
  export function friendsServerList(appId: number, filters?: Record<string, string> | undefined | null): ServerListRequest
  /** Requests the list of servers on the local network for an app. */
  export function lanServerList(appId: number): ServerListRequest
  /**
   * Pings one server.
   * @returns the server details, including latency; rejects when the server does not respond
   */
  export function pingServer(ip: string, port: number): Promise<GameServerDetails>
  /**
   * Lists the players on one server.
   * @returns the players, or rejects when the server does not respond
   */
  export function playerDetails(ip: string, port: number): Promise<Array<PlayerDetails>>
  /**
   * Reads the rules (key and value pairs) of one server.
   * @returns the rules, or rejects when the server does not respond
   */
  export function serverRules(ip: string, port: number): Promise<Array<ServerRule>>
  /** A server list request. Call `release()` when you no longer need it. */
  export class ServerListRequest {
    /** @returns the number of servers in the list */
    getServerCount(): number
    /**
     * @param index - 0-based index into the list
     * @returns the details of the server at `index`
     */
    getServerDetails(index: number): GameServerDetails
    /** Re-queries the whole list. */
    refreshQuery(): void
    /** Re-queries one server in the list. */
    refreshServer(index: number): void
    /** @returns true while a refresh is in progress */
    isRefreshing(): boolean
    /** Releases the request. Using it afterwards returns an error. */
    release(): void
  }
}
export declare namespace networking {
  export interface P2PPacket {
    data: Buffer
    size: number
    steamId: PlayerSteamId
  }
  /** The method used to send a packet */
  export const enum SendType {
    /**
     * Send the packet directly over udp.
     *
     * Can't be larger than 1200 bytes
     */
    Unreliable = 0,
    /**
     * Like `Unreliable` but doesn't buffer packets
     * sent before the connection has started.
     */
    UnreliableNoDelay = 1,
    /**
     * Reliable packet sending.
     *
     * Can't be larger than 1 megabyte.
     */
    Reliable = 2,
    /**
     * Like `Reliable` but applies the nagle
     * algorithm to packets being sent
     */
    ReliableWithBuffering = 3
  }
  /**
   * Sends a packet to another user over Steam peer-to-peer networking.
   * @param steamId64 - recipient SteamID64 as a BigInt
   * @param sendType - delivery mode; each mode has its own size limit
   * @param data - packet payload
   * @returns `true` when Steam queued the packet
   */
  export function sendP2PPacket(steamId64: bigint, sendType: SendType, data: Buffer): boolean
  /**
   * Checks whether a packet is waiting to be read on channel 0.
   * @returns the size in bytes of the next packet, or `0` when none is waiting
   */
  export function isP2PPacketAvailable(): number
  /**
   * Reads the next waiting packet on channel 0.
   * @param size - size of the receive buffer in bytes
   * @returns `data` (the buffer), `size` (bytes read) and `steamId` of the sender; rejects with `No packet available` when none is waiting
   */
  export function readP2PPacket(size: number): P2PPacket
  /**
   * Accepts a peer-to-peer session request from a user. Call it in response to a session request from that user.
   * @param steamId64 - SteamID64 of the user as a BigInt
   */
  export function acceptP2PSession(steamId64: bigint): void
  /**
   * Sends a packet to another user on a specific channel. Each channel is an independent stream.
   * @param steamId64 - recipient SteamID64 as a BigInt
   * @param sendType - delivery mode; each mode has its own size limit
   * @param data - packet payload
   * @param channel - channel number
   * @returns `true` when Steam queued the packet
   */
  export function sendP2PPacketOnChannel(steamId64: bigint, sendType: SendType, data: Buffer, channel: number): boolean
  /** @returns the size of the next packet on the channel, or 0 when none is waiting */
  export function isP2PPacketAvailableOnChannel(channel: number): number
  /** Reads the next packet on a channel. Rejects when no packet is waiting. */
  export function readP2PPacketFromChannel(size: number, channel: number): P2PPacket
  /**
   * Closes the P2P session with a user.
   * @returns true when a session existed and was closed
   */
  export function closeP2PSession(steamId64: bigint): boolean
}
export declare namespace networkingMessages {
  /** A message received on a channel, from `receiveMessagesOnChannel`. */
  export interface ReceivedMessage {
    data: Buffer
    /** SteamID of the sender, or `null` when the sender has no SteamID. */
    steamId64?: bigint | null
    /** The channel the message was sent on. */
    channel: number
  }
  /** A session that failed to be established, passed to the `onSessionFailed` handler. */
  export interface SessionFailure {
    /** SteamID of the peer, or `null` when the peer has no SteamID. */
    steamId64?: bigint | null
    /** Steam's end reason code, or `null` when Steam gave none. */
    endReason?: number | null
  }
  /**
   * Sends a message to a Steam user on a channel. A session is created implicitly when needed.
   * The receiver must call `receiveMessagesOnChannel` with the same channel.
   * @param steamId64 - SteamID of the receiver
   * @param sendFlags - Bitmask of Steam's `k_nSteamNetworkingSend_*` values, for example `8` for reliable or `0` for unreliable
   * @param data - Payload bytes
   * @param channel - Routing number; use `0` when you do not need channels
   */
  export function sendMessageToUser(steamId64: bigint, sendFlags: number, data: Buffer, channel: number): void
  /**
   * Receives the messages waiting on a channel. Returns an empty array when there are none.
   * @param channel - The channel to read; messages on other channels are not returned
   * @param batchSize - Maximum number of messages to return
   */
  export function receiveMessagesOnChannel(channel: number, batchSize: number): Array<ReceivedMessage>
  /**
   * Registers the handler for incoming session requests, replacing any previous handler.
   * Steam reports requests during `runCallbacks()`, and the handler then runs on the JavaScript event loop.
   * It must call `accept` or `reject` on the request.
   */
  export function onSessionRequest(handler: (request: SessionRequest) => void): void
  /**
   * Registers the handler for session failures, replacing any previous handler.
   * Steam reports failures during `runCallbacks()`, and the handler then runs on the JavaScript event loop.
   */
  export function onSessionFailed(handler: (failure: SessionFailure) => void): void
  /**
   * An incoming session request. Call `accept` or `reject` in the `onSessionRequest` handler.
   * A request that is never answered is rejected when this object is garbage collected.
   */
  export class SessionRequest {
    /** SteamID of the user asking to start a session, or `null` when the peer has no SteamID. */
    get steamId64(): bigint | null
    /**
     * Accepts the session.
     * @returns `false` when Steam did not accept it.
     */
    accept(): boolean
    /** Rejects the session, so it is not established. */
    reject(): void
  }
}
export declare namespace networkingSockets {
  /** High-level state of a connection, as reported by Steam. */
  export const enum NetworkingConnectionState {
    /** The connection handle is invalid or the connection has been closed. */
    None = 0,
    /** Trying to establish the connection, including authentication. */
    Connecting = 1,
    /** Looking for a route to the peer. */
    FindingRoute = 2,
    /** Connected and ready to send and receive. */
    Connected = 3,
    /** The peer closed the connection. */
    ClosedByPeer = 4,
    /** Steam detected a problem on the local side. */
    ProblemDetectedLocally = 5
  }
  /** The kind of a `SocketEvent`. */
  export const enum ListenSocketEventKind {
    /** A peer asked to connect. Answer it with `accept` or `reject`. */
    Connecting = 0,
    /** A connection was established. Get it with `takeConnection`. */
    Connected = 1,
    /** A connection ended. */
    Disconnected = 2
  }
  /** Connection details from `Connection.getInfo`. */
  export interface ConnectionInfo {
    state: NetworkingConnectionState
    /** SteamID of the remote peer, or `null` when it is unknown. */
    steamId64?: bigint | null
    /** User data set with `setUserData`. `-1` when none is set. */
    userData: bigint
    /** Steam's end reason code once the connection has ended, otherwise `null`. */
    endReason?: number | null
  }
  /** Real-time statistics from `Connection.getRealtimeStatus`. */
  export interface ConnectionRealtimeStatus {
    state: NetworkingConnectionState
    /** Round-trip ping in milliseconds. */
    ping: number
    /** Quality of the link as measured locally, from 0 to 1. */
    connectionQualityLocal: number
    /** Quality of the link as measured by the peer, from 0 to 1. */
    connectionQualityRemote: number
    outBytesPerSec: number
    inBytesPerSec: number
    sendRateBytesPerSec: number
    pendingUnreliable: number
    pendingReliable: number
    sentUnackedReliable: number
    queuedSendBytes: number
  }
  /** A message received from a poll group, from `PollGroup.receiveMessages`. */
  export interface PollGroupMessage {
    data: Buffer
    /** The user data of the connection that received the message. */
    connectionUserData: bigint
  }
  /**
   * Creates a listen socket on a UDP address. Clients connect with `connectByIpAddress`.
   * @param address - Local address and port, for example `"0.0.0.0:27015"`
   */
  export function createListenSocketIp(address: string): ListenSocket
  /**
   * Creates a listen socket for clients that connect by SteamID with `connectP2P`.
   * @param localVirtualPort - Virtual port clients use. Use `0` when the app has only one listen socket.
   */
  export function createListenSocketP2P(localVirtualPort: number): ListenSocket
  /**
   * Connects to a listen socket on a UDP IP address. The connection is not ready until its state is `Connected`.
   * @param address - Remote address and port, for example `"203.0.113.5:27015"`
   */
  export function connectByIpAddress(address: string): Connection
  /**
   * Connects to a peer by SteamID through the Steam relay network. The peer must listen with `createListenSocketP2P`.
   * @param steamId64 - SteamID of the peer
   * @param remoteVirtualPort - Virtual port the peer listens on
   */
  export function connectP2P(steamId64: bigint, remoteVirtualPort: number): Connection
  /** Creates a poll group for batch receiving from many connections. */
  export function createPollGroup(): PollGroup
  /**
   * Starts authentication, which is needed for authenticated connections. Steam retries on its own if it fails.
   * Call it at startup if you expect to make authenticated connections.
   * @returns The authentication status after the call; poll `getAuthenticationStatus` to follow progress.
   */
  export function initAuthentication(): networkingUtils.NetworkingAvailability
  /** Returns the current authentication status. */
  export function getAuthenticationStatus(): networkingUtils.NetworkingAvailability
  /**
   * An event from a listen socket. Read `kind` first.
   * A `Connecting` event must be answered with `accept` or `reject`. A `Connected` event gives its connection with `takeConnection`.
   */
  export class SocketEvent {
    /** The kind of event. */
    get kind(): ListenSocketEventKind
    /** SteamID of the remote peer, or `null` when the peer has no SteamID. */
    get steamId64(): bigint | null
    /** User data of the connection, as stored by Steam. */
    get userData(): bigint
    /** Steam's end reason code, set only for `Disconnected` events. */
    get endReason(): number | null
    /** Accepts a `Connecting` event. The connection then arrives as a `Connected` event on the same listen socket. */
    accept(): void
    /**
     * Rejects a `Connecting` event.
     * @param endReason - Steam end reason code. Defaults to the generic application code.
     * @param debugMessage - Optional diagnostic text sent to the peer
     * @returns `false` when Steam could not close the connection.
     */
    reject(endReason?: number | undefined | null, debugMessage?: string | undefined | null): boolean
    /** Takes the connection of a `Connected` event. Can be called once. */
    takeConnection(): Connection
  }
  /**
   * A listening socket, from `createListenSocketIp` or `createListenSocketP2P`.
   * Poll `tryReceiveEvent` regularly while `runCallbacks()` runs, and answer connection requests quickly.
   * Existing connections stay open after `close`; the socket only stops accepting new ones.
   */
  export class ListenSocket {
    /** Returns the next pending event, or `null` immediately when there is none. Never waits. */
    tryReceiveEvent(): SocketEvent | null
    /** Stops listening. Connections that already exist are not closed. */
    close(): void
  }
  /** A connection to a peer. Close it with `close` when finished; operations after that return errors. */
  export class Connection {
    /**
     * Sends one message to the peer.
     * @param sendFlags - Bitmask of Steam's `k_nSteamNetworkingSend_*` values, for example `8` for reliable or `0` for unreliable
     */
    send(data: Buffer, sendFlags: number): void
    /** Sends messages that Nagle's algorithm is holding back, as soon as possible. */
    flush(): void
    /** Receives up to `batchSize` messages. Returns an empty array when none are waiting. */
    receive(batchSize: number): Array<Buffer>
    /**
     * Closes the connection and frees its Steam handle. Calling it again returns `false`.
     * @param endReason - Steam end reason code sent to the peer. Defaults to the generic application code.
     * @param debugMessage - Optional diagnostic text sent to the peer
     * @param linger - When `true`, Steam tries to send pending reliable data before closing
     * @returns `false` when Steam could not close the connection
     */
    close(endReason?: number | undefined | null, debugMessage?: string | undefined | null, linger?: boolean | undefined | null): boolean
    /** Returns the user data set with `setUserData`, or `-1` when none is set. */
    getUserData(): bigint
    /** Stores user data on the connection. Steam returns it in events and message info. */
    setUserData(userData: bigint): void
    /** Sets a name for the connection, used mostly for debugging. */
    setName(name: string): void
    /** Adds the connection to a poll group, so its messages come out of `PollGroup.receiveMessages`. */
    setPollGroup(pollGroup: PollGroup): void
    /** Removes the connection from its poll group. */
    clearPollGroup(): void
    /** Returns the state, remote SteamID and end reason of the connection. */
    getInfo(): ConnectionInfo
    /** Returns live statistics: ping, link quality and bandwidth. */
    getRealtimeStatus(): ConnectionRealtimeStatus
  }
  /** A group of connections that can be polled together, from `createPollGroup`. */
  export class PollGroup {
    /**
     * Receives up to `batchSize` messages from all connections in the group.
     * The result never has more than `batchSize` entries.
     */
    receiveMessages(batchSize: number): Array<PollGroupMessage>
    /**
     * Destroys the poll group. Connections in it stay open but are no longer polled by it.
     * @returns `false` when the group was already closed.
     */
    close(): boolean
  }
}
export declare namespace networkingUtils {
  /**
   * Availability of a networking resource. Covers every value of Steam's `ESteamNetworkingAvailability`.
   * The numbers assigned here are not Steam's codes; compare by name.
   */
  export const enum NetworkingAvailability {
    /** Steam has not tried to use this resource yet. */
    NeverTried = 0,
    /** Waiting for another resource before it can be acquired. */
    Waiting = 1,
    /** Trying now, but not successful yet. */
    Attempting = 2,
    /** Online and available. */
    Current = 3,
    /** Steam has no information about this resource. */
    Unknown = 4,
    /** A dependent resource is missing, so this service cannot be used. */
    CannotTry = 5,
    /** Tried for long enough without ever succeeding. */
    Failed = 6,
    /** Worked before, but now there is a problem. */
    Previously = 7,
    /** Failed earlier and is retrying. */
    Retrying = 8
  }
  /** Detailed relay network status, from `getDetailedRelayNetworkStatus`. */
  export interface RelayNetworkStatus {
    /** Summary status. `Current` means relay network initialisation has completed. */
    availability: NetworkingAvailability
    /** `true` while a latency measurement is in progress or waiting for a prerequisite. */
    isPingMeasurementInProgress: boolean
    /** Status of obtaining the network config, a prerequisite for relay access. */
    networkConfig: NetworkingAvailability
    /** Ability to reach any relay. */
    anyRelay: NetworkingAvailability
    /** Non-localised English message for diagnostics only. */
    debuggingMessage: string
  }
  /**
   * Starts relay network access. Call it at startup if you expect to use P2P or relayed connections.
   * Steam retries automatically when needed, so calling it again only forces a retry after a failure.
   */
  export function initRelayNetworkAccess(): void
  /** Returns the summary availability of the relay network. */
  export function getRelayNetworkStatus(): NetworkingAvailability
  /** Returns the detailed relay network status, including the network config and relay reachability. */
  export function getDetailedRelayNetworkStatus(): RelayNetworkStatus
  /** This host's position on Valve's network, from `getLocalPingLocation()`. */
  export interface LocalPingLocation {
    /** The location as text. Its format may change between SDK versions, so pass it only to the functions in this namespace, and do not parse it yourself. */
    location: string
    /** Age of the ping data in seconds. */
    ageSeconds: number
  }
  /** One Valve data center (POP), from `getPops()`. */
  export interface DataCenter {
    /** The data center ID, as Steam encodes it. */
    id: number
    /** Readable code of the data center, such as `iad`. Usually three or four characters. */
    code: string
    /** Best relayed ping in milliseconds, or `null` when Steam has no estimate. */
    ping?: number
  }
  /** The best relayed route to a data center, from `getPingToDataCenter()`. */
  export interface DataCenterRoute {
    /** Relayed ping in milliseconds. */
    pingMs: number
    /** The data center the route goes through, as its ID. */
    viaPop: number
    /** Readable code of `viaPop`. */
    viaCode: string
  }
  /** Classification of an address against Steam's fake IP range. The numbers are not Steam's codes; compare by name. */
  export const enum FakeIpType {
    /** The value is not an IP address. */
    Invalid = 0,
    /** A valid IP address outside the fake range. */
    NotFake = 1,
    /** A globally unique IPv4 address for this app, managed by Steam. */
    GlobalIpv4 = 2,
    /** A locally unique IPv4 address, managed by this process. Do not share it. */
    LocalIpv4 = 3
  }
  /** Description of a config value, from `getConfigValueInfo()`. */
  export interface ConfigValueInfo {
    /** The SDK name of the value, such as `TimeoutInitial`. */
    name: string
    /** Type of the value: `int32`, `int64`, `float`, `string`, or `callback` (a pointer that cannot be read from JavaScript). */
    dataType: string
    /** Scope the value can be set at: `global`, `socketsInterface`, `listenSocket` or `connection`. */
    scope: string
  }
  /**
   * Returns this host's position on Valve's network and the age of that data. Returns `null` when Steam has no ping data yet, which takes a few seconds after `initRelayNetworkAccess()`. Needs `init()`.
   * @returns The location text and the data age in seconds, or `null` when no data is available.
   */
  export function getLocalPingLocation(): LocalPingLocation | null
  /**
   * Parses ping location text, such as one shared by another player, and returns it in Steam's normalized text form. Needs `init()`.
   * @param location - The location text to check.
   * @returns The normalized text, or `null` when Steam does not understand the text.
   */
  export function parsePingLocation(location: string): string | null
  /**
   * Estimates the round-trip time between two ping locations, through the relay network. It does not send packets. Needs `init()`.
   * @param first - Location text from `getLocalPingLocation()` or `parsePingLocation()`.
   * @param second - The other location text.
   * @returns The estimate in milliseconds, or `null` when Steam cannot estimate it. Throws when either text is not understood.
   */
  export function estimatePingBetweenLocations(first: string, second: string): number | null
  /**
   * Estimates the round-trip time from this host to a ping location. Faster than `estimatePingBetweenLocations()` when you compare many locations. Needs `init()`.
   * @param remote - The remote location text.
   * @returns The estimate in milliseconds, or `null` when Steam cannot estimate it. Throws when the text is not understood.
   */
  export function estimatePingFromLocalHost(remote: string): number | null
  /**
   * Checks whether ping data at most `maxAgeSeconds` old exists. If it does not, Steam starts a new measurement and this returns `false`. Needs `init()`.
   * Only call it when you need a fresh measurement now, for example after a user request. Steam refreshes the data on its own.
   * @param maxAgeSeconds - The oldest acceptable age of the data, in seconds. Must be finite and not negative.
   * @returns `true` when recent enough data already exists.
   */
  export function checkPingDataUpToDate(maxAgeSeconds: number): boolean
  /**
   * Returns the best relayed route to a data center, with its ping and the data center the route uses. Needs `init()`.
   * @param pop - The data center ID, from `getPops()`.
   * @returns The route, or `null` when Steam has no estimate.
   */
  export function getPingToDataCenter(pop: number): DataCenterRoute | null
  /**
   * Returns the direct ping, without relaying, to the relays at a data center. Needs `init()`.
   * @param pop - The data center ID.
   * @returns The ping in milliseconds, or `null` when Steam has no estimate.
   */
  export function getDirectPingToPop(pop: number): number | null
  /** Returns the number of data centers (POPs) in the network config. Needs `init()`. */
  export function getPopCount(): number
  /**
   * Returns every data center in the network config, with its code and best relayed ping. Needs `init()`.
   * @returns One entry per data center. An empty array when the config lists none, or when Steam has not loaded it yet.
   */
  export function getPops(): Array<DataCenter>
  /**
   * Returns the local timestamp in microseconds. It never goes backwards, and it is only comparable within this run of the process. Needs `init()`.
   * @returns The timestamp as a BigInt.
   */
  export function getLocalTimestamp(): bigint
  /**
   * Returns `true` when an IPv4 address is in Steam's fake IP range. Needs `init()`.
   * @param ipv4 - The IPv4 address as the SDK's 32-bit number. Its byte order is unverified against a live Steam client.
   */
  export function isFakeIpv4(ipv4: number): boolean
  /**
   * Classifies an IPv4 address against the fake IP range. Needs `init()`.
   * @param ipv4 - The IPv4 address as the SDK's 32-bit number. Its byte order is unverified against a live Steam client.
   */
  export function getIpv4FakeIpType(ipv4: number): FakeIpType
  /**
   * Returns the real identity behind a fake IP address, as text. Steam keeps the mapping for active connections and for a short time after they close. Needs `init()`.
   * @param fakeIp - The fake address, as `ip` or `ip:port` text.
   * @returns The identity text. Throws with Steam's reason when the address is not a fake IP (InvalidParameter) or the mapping is unknown (NoMatch).
   */
  export function getRealIdentityForFakeIp(fakeIp: string): string
  /**
   * Formats an IP address in Steam's text form. Needs `init()`.
   * @param address - The address text, with or without a port.
   * @param withPort - Whether to include the port in the output.
   * @returns The formatted address. Throws when the text is not an IP address.
   */
  export function ipAddrToString(address: string, withPort: boolean): string
  /**
   * Parses an IP address and returns it in Steam's text form, with the port. Needs `init()`.
   * @param address - The address text.
   * @returns The normalized text, or `null` when Steam does not understand it.
   */
  export function parseIpAddr(address: string): string | null
  /**
   * Classifies an IP address against Steam's fake IP range. Needs `init()`.
   * @param address - The address text, with or without a port.
   * @returns The classification. Throws when the text is not an IP address.
   */
  export function getIpAddrFakeIpType(address: string): FakeIpType
  /**
   * Formats a networking identity (such as a SteamID or an IP address) in Steam's text form. Use it for logs and storage; do not parse the text yourself. Needs `init()`.
   * @param identity - The identity text.
   * @returns The formatted identity. Throws when the text is not an identity.
   */
  export function identityToString(identity: string): string
  /**
   * Parses a networking identity text and returns it in Steam's normalized form. Needs `init()`.
   * @param identity - The identity text.
   * @returns The normalized text, or `null` when Steam does not understand it.
   */
  export function parseIdentity(identity: string): string | null
  /**
   * Sets a global `int32` config value. Needs `init()`.
   * @param valueId - The config value number, from `getConfigValueInfo()` or `iterateGenericEditableConfigValues()`.
   * @returns `true` when Steam accepted the value, `false` when it refused it (for example the setting has another type).
   */
  export function setGlobalConfigValueInt32(valueId: number, value: number): boolean
  /**
   * Sets a global `float` config value. Needs `init()`.
   * @param valueId - The config value number.
   * @returns `true` when Steam accepted the value, `false` when it refused it.
   */
  export function setGlobalConfigValueFloat(valueId: number, value: number): boolean
  /**
   * Sets a global `string` config value. Needs `init()`.
   * @param valueId - The config value number.
   * @returns `true` when Steam accepted the value, `false` when it refused it. Throws when the text contains a NUL character.
   */
  export function setGlobalConfigValueString(valueId: number, value: string): boolean
  /**
   * Sets an `int32` config value on one connection. Needs `init()`.
   * The JavaScript `Connection` object does not expose its handle yet, so pass the raw `HSteamNetConnection` number from another source.
   * @param connection - The raw connection handle.
   * @returns `true` when Steam accepted the value, `false` when it refused it or the connection handle is invalid.
   */
  export function setConnectionConfigValueInt32(connection: number, valueId: number, value: number): boolean
  /**
   * Sets a `float` config value on one connection. Needs `init()`. See `setConnectionConfigValueInt32()` for the handle.
   * @param connection - The raw connection handle.
   * @returns `true` when Steam accepted the value, `false` otherwise.
   */
  export function setConnectionConfigValueFloat(connection: number, valueId: number, value: number): boolean
  /**
   * Sets a `string` config value on one connection. Needs `init()`. See `setConnectionConfigValueInt32()` for the handle.
   * @param connection - The raw connection handle.
   * @returns `true` when Steam accepted the value, `false` otherwise. Throws when the text contains a NUL character.
   */
  export function setConnectionConfigValueString(connection: number, valueId: number, value: string): boolean
  /**
   * Reads a config value, globally or for one connection. Needs `init()`.
   * The result is a number for `int32` and `float` values, a BigInt for `int64` values (so large values stay exact), and a string for `string` values.
   * @param valueId - The config value number.
   * @param connection - Optional raw connection handle. When given, the value is read for that connection, falling back to the inherited value.
   * @returns The value, or `null` when it does not exist, the connection is invalid, or the value is a callback.
   */
  export function getConfigValue(valueId: number, connection?: number | undefined | null): number | bigint | string | null
  /**
   * Returns the name, type and scope of a config value. Needs `init()`.
   * @param valueId - The config value number.
   * @returns The description, or `null` when the value does not exist.
   */
  export function getConfigValueInfo(valueId: number): ConfigValueInfo | null
  /**
   * Returns the next config value that a generic settings screen can edit. Pass `null` to start from the beginning. Needs `init()`.
   * @param current - The value returned by the previous call, or `null` to start.
   * @param includeDevVars - Whether to include development-only values. Keep it `false` in a shipped build.
   * @returns The next config value number, or `null` at the end of the list.
   */
  export function iterateGenericEditableConfigValues(current?: number | undefined | null, includeDevVars?: boolean | undefined | null): number | null
}
export declare namespace overlay {
  export const enum Dialog {
    /** Friends list dialog. */
    Friends = 0,
    /** Steam Community dialog. */
    Community = 1,
    /** Recent players dialog. */
    Players = 2,
    /** Steam settings dialog. */
    Settings = 3,
    /** Official group of the game. */
    OfficialGameGroup = 4,
    /** Game statistics dialog. */
    Stats = 5,
    /** Achievements dialog. */
    Achievements = 6
  }
  export const enum StoreFlag {
    /** Open the store page without adding the app to the cart. */
    None = 0,
    /** Add the app to the cart without showing the cart. */
    AddToCart = 1,
    /** Add the app to the cart and show the cart. */
    AddToCartAndShow = 2
  }
  /**
   * Opens a Steam overlay dialog. Unverified against a live Steam client: nothing is shown when the overlay is disabled.
   * @param dialog - dialog to open
   */
  export function activateDialog(dialog: Dialog): void
  /**
   * Opens a Steam overlay dialog for a specific user. Unverified against a live Steam client.
   * @param dialog - dialog to open
   * @param steamId64 - SteamID64 of the user as a BigInt
   */
  export function activateDialogToUser(dialog: Dialog, steamId64: bigint): void
  /**
   * Opens the Steam invite dialog for a lobby.
   * @param lobbyId - lobby ID as a BigInt
   */
  export function activateInviteDialog(lobbyId: bigint): void
  /**
   * Opens a web page in the Steam overlay browser. Unverified against a live Steam client.
   * @param url - absolute URL to open
   */
  export function activateToWebPage(url: string): void
  /**
   * Opens the Steam store page of an app in the overlay.
   * @param appId - AppID of the app to show
   * @param flag - whether to add the app to the cart, and whether to show the cart
   */
  export function activateToStore(appId: number, flag: StoreFlag): void
}
export declare namespace remotePlay {
  export interface RemotePlaySessionInfo {
    sessionId: number
    steamId64: bigint
  }
  export interface RemotePlayResolution {
    width: number
    height: number
  }
  export const enum DeviceFormFactor {
    Phone = 0,
    Tablet = 1,
    Computer = 2,
    TV = 3
  }
  export interface RemotePlaySessionDetails {
    /** Name of the client device, or `null` when the session has ended. */
    clientName?: string
    /** Form factor of the client device, or `null` when unavailable. */
    formFactor?: DeviceFormFactor
    /** Resolution of the client device, or `null` when unavailable. */
    resolution?: RemotePlayResolution
  }
  /** Lists the active Remote Play sessions. */
  export function sessions(): Array<RemotePlaySessionInfo>
  /** Reads the client name, form factor and resolution of one session. */
  export function sessionDetails(sessionId: number): RemotePlaySessionDetails
  /**
   * Invites a friend to join the game with Remote Play Together.
   * @returns true when the invite was sent
   */
  export function invite(steamId64: bigint): boolean
}
export declare namespace screenshots {
  /** Turns the Steam screenshot hotkey into a `ScreenshotRequested` callback, so the game takes the screenshot itself. */
  export function hookScreenshots(hook: boolean): void
  /**
   * Checks whether the screenshot hotkey is currently hooked by the game (see `hookScreenshots`).
   * @returns `true` when hooked, otherwise `false`
   */
  export function isScreenshotsHooked(): boolean
  /** Triggers a screenshot, the same as the player pressing the screenshot hotkey. */
  export function triggerScreenshot(): void
  /**
   * Adds an image file to the Steam screenshot library.
   * @returns the screenshot handle, which `ScreenshotReady` also reports
   */
  export function addScreenshotToLibrary(filename: string, thumbnailFilename: string | undefined | null, width: number, height: number): number
}
export declare namespace stats {
  /**
   * Reads an integer stat of the local user from the locally loaded stats. Unverified against a live Steam client: the stats must be loaded first.
   * @param name - stat name as defined in the Steamworks site
   * @returns the stat value, or `null` when the stat is missing or not loaded
   */
  export function getInt(name: string): number | null
  /**
   * Sets an integer stat of the local user. The value is not sent to Steam until `store()` is called.
   * @param name - stat name as defined in the Steamworks site
   * @param value - 32-bit signed integer
   * @returns `true` when Steam accepted the change, otherwise `false`
   */
  export function setInt(name: string, value: number): boolean
  /**
   * Sends the pending stat and achievement changes of the local user to Steam. The request is asynchronous, so `true` only means Steam accepted it.
   * @returns `true` when Steam accepted the request, otherwise `false`
   */
  export function store(): boolean
  /**
   * Resets all stats of the local user. This cannot be undone from this binding.
   * @param achievementsToo - `true` also clears the user's achievements
   * @returns `true` when Steam accepted the reset, otherwise `false`
   */
  export function resetAll(achievementsToo: boolean): boolean
  /** @returns the float stat value, or `null` when the stat is not defined */
  export function getFloat(name: string): number | null
  /** Sets a float stat. The value is stored as a 32-bit float. Returns `false` when Steam rejects it. */
  export function setFloat(name: string, value: number): boolean
  /** @returns the number of achievements defined for the game, or `null` when statistics are not available */
  export function getNumAchievements(): number | null
  /** Asks Steam to fetch another user's statistics. The result arrives later through the `UserStatsReceived` callback. */
  export function requestUserStats(steamId64: bigint): void
  /**
   * Reads an integer stat of another user. Needs `requestUserStats(steamId64)` to have completed for that user first.
   * @param steamId64 - the other user's 64-bit SteamID
   * @param name - stat name as defined in the Steamworks site
   * @returns the value, or `null` when the stat is missing, the user's stats are not loaded, or the SteamID is not a valid 64-bit value
   */
  export function getUserInt(steamId64: bigint, name: string): number | null
  /**
   * Reads a float stat of another user. Same requirements as `getUserInt()`.
   * @param steamId64 - the other user's 64-bit SteamID
   * @param name - stat name as defined in the Steamworks site
   * @returns the value, or `null` when the stat is missing, the user's stats are not loaded, or the SteamID is not a valid 64-bit value
   */
  export function getUserFloat(steamId64: bigint, name: string): number | null
  /**
   * Adds to an average-rate stat of the local user. The change is sent to Steam only after `store()`. Steam keeps the count as a 32-bit float, so very large counts lose precision.
   * @param name - stat name as defined in the Steamworks site
   * @param countThisSession - the amount accumulated in this session
   * @param sessionLength - the length of the session, in seconds
   * @returns `true` when Steam accepted the change, otherwise `false` (for example a name with a NUL character)
   */
  export function updateAvgRateStat(name: string, countThisSession: number, sessionLength: number): boolean
  /**
   * Asks Steam for the global stats of the game and the daily history of the last `historyDays` days. Resolves when Steam answers, which happens while `runCallbacks()` runs. Needs `init()`.
   * @param historyDays - days of daily history to fetch, from `0` to `60`
   * @returns the GameID Steam reports for the app; rejects when `historyDays` is above 60 or when Steam reports an error
   */
  export function requestGlobalStats(historyDays: number): Promise<bigint>
  /**
   * Reads a global integer stat. Needs `requestGlobalStats()` to have completed.
   * @param name - stat name as defined in the Steamworks site
   * @returns the value as a BigInt, or `null` when the stat is not defined or the global stats are not loaded
   */
  export function getGlobalInt(name: string): bigint | null
  /**
   * Reads a global float stat. Needs `requestGlobalStats()` to have completed.
   * @param name - stat name as defined in the Steamworks site
   * @returns the value, or `null` when the stat is not defined or the global stats are not loaded
   */
  export function getGlobalFloat(name: string): number | null
  /**
   * Reads the daily history of a global integer stat, newest day first. Needs `requestGlobalStats()` to have completed.
   * @param name - stat name as defined in the Steamworks site
   * @param days - number of days to read, from `0` to `60`, and at most the days asked for in `requestGlobalStats()`
   * @returns the daily values as BigInts, or `null` when the stat is unknown, the global stats are not loaded, or `days` is above 60
   */
  export function getGlobalIntHistory(name: string, days: number): Array<bigint> | null
  /**
   * Reads the daily history of a global float stat, newest day first. Same requirements as `getGlobalIntHistory()`.
   * @param name - stat name as defined in the Steamworks site
   * @param days - number of days to read, from `0` to `60`, and at most the days asked for in `requestGlobalStats()`
   * @returns the daily values, or `null` when the stat is unknown, the global stats are not loaded, or `days` is above 60
   */
  export function getGlobalFloatHistory(name: string, days: number): Array<number> | null
  /**
   * Asks Steam how many players are playing the game right now, online and offline. Resolves when Steam answers, which happens while `runCallbacks()` runs.
   * @returns the player count; rejects when Steam reports a failure
   */
  export function getNumberOfCurrentPlayers(): Promise<number>
}
export declare namespace timeline {
  export const enum TimelineGameMode {
    Playing = 0,
    Staging = 1,
    Menus = 2,
    LoadingScreen = 3
  }
  export const enum TimelineEventClipPriority {
    None = 0,
    Standard = 1,
    Featured = 2
  }
  /** Sets the game mode shown on the Steam timeline. */
  export function setGameMode(mode: TimelineGameMode): void
  /** Shows a state description on the timeline for `durationSeconds`. An empty description is allowed. */
  export function setStateDescription(description: string, durationSeconds: number): void
  /** Clears the state description after `durationSeconds`. */
  export function clearStateDescription(durationSeconds: number): void
  /**
   * Marks an event on the timeline.
   * @param startOffsetSeconds - seconds from now at which the event starts (may be negative)
   * @param durationSeconds - how long the event lasts, must not be negative
   */
  export function addEvent(icon: string, title: string, description: string, priority: number, startOffsetSeconds: number, durationSeconds: number, clipPriority: TimelineEventClipPriority): void
  /** Result of `doesEventRecordingExist()`. */
  export interface EventRecordingExists {
    /** The event handle that was asked about. */
    event: bigint
    /** `true` when a background recording covers the event. */
    recordingExists: boolean
  }
  /** Result of `doesGamePhaseRecordingExist()`. */
  export interface GamePhaseRecordingExists {
    /** The phase ID, as Steam returns it. */
    phaseId: string
    /** Length in milliseconds of the background recording covering the phase. */
    recordingMs: number
    /** Length in milliseconds of the longest clip made from the phase. */
    longestClipMs: number
    /** Number of clips made from the phase. */
    clipCount: number
    /** Number of screenshots taken during the phase. */
    screenshotCount: number
  }
  /**
   * Adds an event that happens at one moment on the Steam timeline. Needs `init()`.
   * @param title - Title shown on the timeline, in the language from `getUiLanguage()`.
   * @param description - Description shown on the timeline, in the same language.
   * @param icon - Name of an icon uploaded for the app, or a built-in `steam_` icon.
   * @param iconPriority - Priority of the icon. Higher values are shown first.
   * @param startOffsetSeconds - Seconds from now at which the event happens. Negative for the past.
   * @param clipPriority - Whether the event makes a clip, and how important it is.
   * @returns The event handle, or `null` when the timeline is unavailable. Throws when a text contains a NUL character or the offset is not finite.
   */
  export function addInstantaneousTimelineEvent(title: string, description: string, icon: string, iconPriority: number, startOffsetSeconds: number, clipPriority: TimelineEventClipPriority): bigint | null
  /**
   * Starts a range event now (plus `startOffsetSeconds`). It lasts until `endRangeTimelineEvent()`. Needs `init()`.
   * Steam discards range events that are still open when the game exits.
   * @param title - Title shown on the timeline.
   * @param description - Description shown on the timeline.
   * @param icon - Name of an icon uploaded for the app, or a built-in `steam_` icon.
   * @param priority - Priority of the event.
   * @param startOffsetSeconds - Seconds from now at which the event starts. Negative for the past.
   * @param clipPriority - Whether the event makes a clip, and how important it is.
   * @returns The event handle, or `null` when the timeline is unavailable. Throws when a text contains a NUL character or the offset is not finite.
   */
  export function startRangeTimelineEvent(title: string, description: string, icon: string, priority: number, startOffsetSeconds: number, clipPriority: TimelineEventClipPriority): bigint | null
  /**
   * Changes the fields of a range event that has started and not ended. Needs `init()`.
   * Does nothing when the timeline is unavailable. Throws when the handle is not a BigInt from this API or a text contains a NUL character.
   * @param event - The handle from `startRangeTimelineEvent()`.
   */
  export function updateRangeTimelineEvent(event: bigint, title: string, description: string, icon: string, priority: number, clipPriority: TimelineEventClipPriority): void
  /**
   * Ends a range event, `endOffsetSeconds` from now, and shows it on the timeline. Needs `init()`.
   * Does nothing when the timeline is unavailable. Throws when the handle is not valid or the offset is not finite.
   * @param event - The handle from `startRangeTimelineEvent()`.
   * @param endOffsetSeconds - Seconds from now at which the event ends. Negative for the past.
   */
  export function endRangeTimelineEvent(event: bigint, endOffsetSeconds: number): void
  /**
   * Removes an event from the timeline. Works for instantaneous and range events. Needs `init()`.
   * Does nothing when the timeline is unavailable. Throws when the handle is not valid.
   * @param event - The event handle.
   */
  export function removeTimelineEvent(event: bigint): void
  /**
   * Asks whether a background recording covers an event. Needs `init()`.
   * The promise resolves when Steam answers, which happens during `runCallbacks()`, so keep calling it while the promise is pending.
   * @param event - The event handle.
   * @returns The answer, with the handle again. Rejects when the timeline is unavailable or Steam cannot answer (for example a disk I/O failure).
   */
  export function doesEventRecordingExist(event: bigint): Promise<EventRecordingExists>
  /**
   * Starts a game phase, which ends the previous one. A phase is a stretch of play of about 10 minutes to a few hours, such as one match or one chapter. Needs `init()`.
   * Does nothing when the timeline is unavailable.
   */
  export function startGamePhase(): void
  /** Ends the current game phase. Needs `init()`. Does nothing when the timeline is unavailable. */
  export function endGamePhase(): void
  /**
   * Sets the ID of the current game phase, so `openOverlayToGamePhase()` and `doesGamePhaseRecordingExist()` can find it. Needs `init()`.
   * Does nothing when the timeline is unavailable. Throws when the ID is longer than 63 bytes or contains a NUL character.
   * @param phaseId - The phase ID. Use a stable value you can look up later.
   */
  export function setGamePhaseId(phaseId: string): void
  /**
   * Asks whether a background recording covers a game phase. Needs `init()`.
   * The promise resolves when Steam answers, which happens during `runCallbacks()`, so keep calling it while the promise is pending.
   * @param phaseId - The phase ID set with `setGamePhaseId()`.
   * @returns The recording and clip lengths in milliseconds, and the clip and screenshot counts. Rejects when the timeline is unavailable, the ID is not valid, or Steam cannot answer.
   */
  export function doesGamePhaseRecordingExist(phaseId: string): Promise<GamePhaseRecordingExists>
  /**
   * Adds a tag that applies to the whole current game phase. Several tags of one group are all kept. Needs `init()`.
   * Does nothing when the timeline is unavailable. Throws when a text contains a NUL character.
   * @param tagName - Localized tag text.
   * @param tagIcon - Name of an icon.
   * @param tagGroup - Localized group name the tag belongs to.
   * @param priority - Priority of the tag.
   */
  export function addGamePhaseTag(tagName: string, tagIcon: string, tagGroup: string, priority: number): void
  /**
   * Sets a text attribute for the whole current game phase, such as a score. Only the last value set is shown. Needs `init()`.
   * Does nothing when the timeline is unavailable. Throws when a text contains a NUL character.
   * @param attributeGroup - Localized name of the attribute.
   * @param attributeValue - The value to show.
   * @param priority - Priority of the attribute.
   */
  export function setGamePhaseAttribute(attributeGroup: string, attributeValue: string, priority: number): void
  /**
   * Opens the Steam overlay on a game phase that has an ID set with `setGamePhaseId()`. Needs `init()`.
   * Does nothing when the timeline is unavailable. Throws when the ID is too long or contains a NUL character.
   * @param phaseId - The phase ID.
   */
  export function openOverlayToGamePhase(phaseId: string): void
  /**
   * Opens the Steam overlay on a timeline event. Needs `init()`.
   * Does nothing when the timeline is unavailable. Throws when the handle is not valid.
   * @param event - The event handle.
   */
  export function openOverlayToTimelineEvent(event: bigint): void
}
export declare namespace utils {
  /** The Steam universe a client connects to. The numbers match `EUniverse`. */
  export const enum Universe {
    /** Not set. */
    Invalid = 0,
    /** The public Steam universe. */
    Public = 1,
    /** The beta universe. */
    Beta = 2,
    /** The internal Valve universe. */
    Internal = 3,
    /** The development universe. */
    Dev = 4
  }
  /** The verdict of `checkFileSignature`. The numbers match `ECheckFileSignature`. */
  export const enum FileSignatureStatus {
    /** The file is not signed, or the signature does not match. */
    InvalidSignature = 0,
    /** The file is signed and the signature is valid. */
    ValidSignature = 1,
    /** The file does not exist on disk. */
    FileNotFound = 2,
    /** The app has no signing set on the partner site. */
    NoSignaturesFoundForThisApp = 3,
    /** The file is not listed in the signing set on the partner site. */
    NoSignaturesFoundForThisFile = 4
  }
  /** The protocol to test with `getIpv6ConnectivityState`. The numbers match `ESteamIPv6ConnectivityProtocol`. */
  export const enum Ipv6Protocol {
    /** HTTP, which can differ from the other protocols when a proxy is in use. */
    Http = 1,
    /** UDP on a port Steam also uses. If UDP works, TCP probably works too. */
    Udp = 2
  }
  /** IPv6 connectivity state of this machine. The numbers match `ESteamIPv6ConnectivityState`. */
  export const enum Ipv6ConnectivityState {
    /** No test has run yet. */
    Unknown = 0,
    /** A recent IPv6 request succeeded. */
    Good = 1,
    /** A request failed: no IPv6 address, or no upstream connectivity. */
    Bad = 2
  }
  /** The kind of text given to `filterText`. The numbers match `ETextFilteringContext`. */
  export const enum TextFilteringContext {
    /** Unknown context. */
    Unknown = 0,
    /** Game content: only the legally required filtering is applied. */
    GameContent = 1,
    /** Chat from another player. */
    Chat = 2,
    /** A character or item name. */
    Name = 3
  }
  /** The output of `filterText`. */
  export interface FilteredText {
    /** The filtered message, as UTF-8. */
    text: string
    /** The number of characters the filter changed, as the SDK reports it. */
    filteredCount: number
  }
  /**
   * Returns the AppID of the running game.
   * @returns the AppID
   */
  export function getAppId(): number
  /**
   * Returns the current time on the Steam servers.
   * @returns seconds since 1970-01-01 UTC
   */
  export function getServerRealTime(): number
  /**
   * Checks whether Steam is running on a Steam Deck.
   * @returns `true` on a Steam Deck, otherwise `false`
   */
  export function isSteamRunningOnSteamDeck(): boolean
  export const enum GamepadTextInputMode {
    Normal = 0,
    Password = 1
  }
  export const enum GamepadTextInputLineMode {
    SingleLine = 0,
    MultipleLines = 1
  }
  /** @returns the entered text, or null if cancelled or could not show the input */
  export function showGamepadTextInput(inputMode: GamepadTextInputMode, inputLineMode: GamepadTextInputLineMode, description: string, maxCharacters: number, existingText?: string | undefined | null): Promise<string | null>
  export const enum FloatingGamepadTextInputMode {
    SingleLine = 0,
    MultipleLines = 1,
    Email = 2,
    Numeric = 3
  }
  /** @returns true if the floating keyboard was shown, otherwise, false */
  export function showFloatingGamepadTextInput(keyboardMode: FloatingGamepadTextInputMode, x: number, y: number, width: number, height: number): Promise<boolean>
  /** @returns true when the Steam overlay is enabled for the running game */
  export function isOverlayEnabled(): boolean
  /** @returns true when Steam is running in Big Picture mode */
  export function isSteamInBigPictureMode(): boolean
  /** @returns the language code of the Steam UI, for example `english` or `schinese` */
  export function getUiLanguage(): string
  /**
   * Returns the seconds since the user was last active in the game. The SDK header does not define "active" any further; unverified against a live Steam client.
   * @returns the number of seconds, as an unsigned 32-bit integer
   */
  export function getSecondsSinceAppActive(): number
  /**
   * Returns the seconds since the user was last active on this computer. The SDK header does not define "active" any further; unverified against a live Steam client.
   * @returns the number of seconds, as an unsigned 32-bit integer
   */
  export function getSecondsSinceComputerActive(): number
  /** @returns the Steam universe this client connects to, or `null` when the SDK reports a value this binding does not name */
  export function getConnectedUniverse(): Universe | null
  /** @returns the battery charge in percent (0 to 100), or 255 while the computer is on AC power */
  export function getCurrentBatteryPower(): number
  /**
   * Returns the number of IPC calls made since the previous call, and starts a new count. Every IPC call costs at least a thread context switch, so a high count per frame means the game talks to Steam too often.
   * @returns the count since the previous call, as an unsigned 32-bit integer
   */
  export function getIpcCallCount(): number
  /**
   * Returns whether the overlay needs the game to present a frame (`Present` or `SwapBuffers`). Only games that redraw on events instead of every frame need this; the SDK suggests polling it about 33 times a second.
   * @returns `true` when a present is needed, otherwise `false`
   */
  export function overlayNeedsPresent(): boolean
  /**
   * Starts checking a file against the signing set on the partner site, for example to refuse modified executables. Resolves once Steam answers; the answer arrives while `runCallbacks()` runs.
   * An app with no signing set resolves with `NoSignaturesFoundForThisApp`, which is a result and not an error.
   * @param fileName - path of the file to check; a name with a NUL character is rejected
   * @returns the verdict for the file
   */
  export function checkFileSignature(fileName: string): Promise<FileSignatureStatus>
  /** @returns the length of the text the user last entered in the gamepad text dialog. The SDK header does not state the unit or whether the terminator counts; unverified against a live Steam client. */
  export function getEnteredGamepadTextLength(): number
  /** @returns `true` when Steam itself runs in VR mode, otherwise `false` */
  export function isSteamRunningInVr(): boolean
  /**
   * Sets the inset, in pixels, of overlay notifications from the corner the game chose for them.
   * @param horizontal - pixels from the side edge of that corner
   * @param vertical - pixels from the top or bottom edge of that corner
   */
  export function setOverlayNotificationInset(horizontal: number, vertical: number): void
  /** @returns `true` when HMD content is streamed through Steam Remote Play. The default is `true` unless the game's app info sets `VRHeadsetStreaming` to `0`. */
  export function isVrHeadsetStreamingEnabled(): boolean
  /**
   * Sets whether HMD content is streamed through Steam Remote Play. `true` streams the headset scene and blocks remote input; `false` streams the application window and allows remote input.
   * @param enabled - the new setting
   */
  export function setVrHeadsetStreamingEnabled(enabled: boolean): void
  /** @returns `true` when this Steam client is the Steam China launcher rather than the global client, otherwise `false` */
  export function isSteamChinaLauncher(): boolean
  /**
   * Loads the text filter dictionaries for the language the game runs in. Call it before `filterText`.
   * @returns `false` when filtering is unavailable for that language; `filterText` then returns the text unchanged
   */
  export function initFilterText(): boolean
  /**
   * Filters a message with the legally required filter and the user's account preferences. Needs `initFilterText()` first.
   * @param context - the kind of text being filtered
   * @param sourceSteamId64 - the 64-bit SteamID of whoever wrote the text
   * @param message - the text to filter
   * @returns the filtered text and the number of characters changed, or `null` when the message contains a NUL character or the SteamID is not a valid 64-bit value
   */
  export function filterText(context: TextFilteringContext, sourceSteamId64: bigint, message: string): FilteredText | null
  /**
   * Returns what Steam believes the machine's IPv6 connectivity to the internet is, on one protocol. It does not tell whether the Steam client itself connects over IPv6.
   * @param protocol - the protocol to test
   * @returns the state, or `null` when the SDK reports a value this binding does not name
   */
  export function getIpv6ConnectivityState(protocol: Ipv6Protocol): Ipv6ConnectivityState | null
  /**
   * Turns on or off Steam Input translation of controller input into mouse and keyboard input. Use it in game launchers that have no controller support of their own.
   * @param enabled - `true` to turn the translation on
   */
  export function setGameLauncherMode(enabled: boolean): void
  /**
   * Dismisses the full-screen gamepad text dialog that `showGamepadTextInput` opened. The header does not say whether that call's Promise then settles (unverified).
   * @returns the SDK's result as it is; the header does not say what `false` means (unverified)
   */
  export function dismissGamepadTextInput(): boolean
  /**
   * Dismisses the floating keyboard that `showFloatingGamepadTextInput` opened.
   * @returns the SDK's result as it is; the header does not say what `false` means (unverified)
   */
  export function dismissFloatingGamepadTextInput(): boolean
}
export declare namespace workshop {
  export interface UgcResult {
    /** The Workshop item id the update or creation applies to. */
    itemId: bigint
    /** True when Steam reports that the account still has to accept the Workshop legal agreement. */
    needsToAcceptAgreement: boolean
  }
  export const enum UgcItemVisibility {
    Public = 0,
    FriendsOnly = 1,
    Private = 2,
    Unlisted = 3
  }
  /** Workshop file types for `createItem`. Omitting the argument keeps `Community`. */
  export const enum WorkshopFileType {
    Community = 0,
    Art = 1,
    Screenshot = 2,
    Video = 3,
    Collection = 4,
    WebGuide = 5,
    IntegratedGuide = 6
  }
  /** Steam's community content descriptors. The values are the SDK's own IDs. */
  export const enum WorkshopContentDescriptor {
    NudityOrSexualContent = 1,
    FrequentViolenceOrGore = 2,
    AdultOnlySexualContent = 3,
    GratuitousSexualContent = 4,
    AnyMatureContent = 5
  }
  /** One key-value tag, stored on the item as `key=value`. */
  export interface KeyValueTag {
    key: string
    value: string
  }
  /** Key-value tag changes. They are applied in the order clear, remove, add. */
  export interface KeyValueTagsUpdate {
    /** Removes every key-value tag of the item first. */
    clear?: boolean
    /** Keys whose values are all removed. */
    remove?: Array<string>
    /** Pairs added after the removals. */
    add?: Array<KeyValueTag>
  }
  /** Content descriptor changes. Removals are applied before additions. */
  export interface ContentDescriptorsUpdate {
    remove?: Array<WorkshopContentDescriptor>
    add?: Array<WorkshopContentDescriptor>
  }
  export interface UgcUpdate {
    /** New title of the item, in the language given by `language`. */
    title?: string
    /** New description of the item, in the language given by `language`. */
    description?: string
    /** Note shown in the item's change history for this update. */
    changeNote?: string
    /** Absolute path of an image file that replaces the main preview. */
    previewPath?: string
    /** Image files appended to the item's additional previews (screenshots). */
    additionalPreviewPaths?: Array<string>
    /** 0-based indexes of additional previews to remove, as listed in `additionalPreviews`. */
    removeAdditionalPreviewIndexes?: Array<number>
    /** Absolute path of a folder whose files become the item's content. */
    contentPath?: string
    /** Tags for the item. When given, they replace the item's tag list. */
    tags?: Array<string>
    /** Who can see the item: Public, FriendsOnly, Private or Unlisted. */
    visibility?: UgcItemVisibility
    /** Steam language code (for example `english` or `schinese`) that `title` and `description` are written in. Left out, the README says it is treated as `english`. */
    language?: string
    /**
     * Oldest game version (Steam branch, e.g. `open_beta`) the item is valid for.
     * Set either required-version field to change the range; the unset end becomes open.
     * Pass both as `""` to make the item valid for every game version again.
     * Steam applies the range only when this update also changes the item's content.
     */
    requiredGameVersionMin?: string
    /** Newest game version (Steam branch) the item is valid for; see `requiredGameVersionMin`. */
    requiredGameVersionMax?: string
    /** YouTube video IDs (11 characters each) added as video previews. Checked before submission. */
    additionalPreviewVideos?: Array<string>
    /** Developer metadata set on the item. Left unchanged when omitted. */
    metadata?: string
    /** Key-value tag changes, applied in the order clear, remove, add. */
    keyValueTags?: KeyValueTagsUpdate
    /** Content descriptor changes, applied as removals then additions. */
    contentDescriptors?: ContentDescriptorsUpdate
  }
  export interface InstallInfo {
    folder: string
    sizeOnDisk: bigint
    timestamp: number
  }
  export interface DownloadInfo {
    current: bigint
    total: bigint
  }
  export const enum UpdateStatus {
    Invalid = 0,
    PreparingConfig = 1,
    PreparingContent = 2,
    UploadingContent = 3,
    UploadingPreviewFile = 4,
    CommittingChanges = 5
  }
  export interface UpdateProgress {
    status: UpdateStatus
    progress: bigint
    total: bigint
  }
  /**
   * Creates an empty Workshop item. The file type defaults to `Community`; `Art` creates an Artwork item.
   *
   * @param appId - defaults to the app id the client was initialized with
   * @param fileType - the Workshop file type; omitted keeps `Community`
   */
  export function createItem(appId?: number | undefined | null, fileType?: WorkshopFileType | undefined | null): Promise<UgcResult>
  /**
   * Updates an existing Workshop item on Steam. Every field of `updateDetails` is optional: a field
   * that is left out keeps the item's current value, so a call with only `previewPath` changes only
   * the preview. The fields are checked first, and a bad YouTube video id or a string with a NUL byte
   * rejects with the entry named, before anything is sent.
   *
   * Once submitted, the change is applied to the item on Steam and cannot be cancelled. A running,
   * logged-in Steam client is needed.
   *
   * Resolves with the item id and `needsToAcceptAgreement`. Rejects when the update cannot be started,
   * when Steam returns an error, or when no completion arrives; in that last case the outcome is
   * unknown, so read the item before retrying.
   *
   * @param itemId - the Workshop item to update (its published file id)
   * @param updateDetails - the fields to change; see `UgcUpdate`
   * @param appId - defaults to the app id the client was initialized with
   * @returns the item id and whether the account still has to accept the Workshop legal agreement
   */
  export function updateItem(itemId: bigint, updateDetails: UgcUpdate, appId?: number | undefined | null): Promise<UgcResult>
  /**
   * Replace only the main preview image of a Workshop item.
   *
   * The mod content is not sent: nothing is uploaded from a content folder, and the title,
   * description, tags and visibility stay as they are.
   *
   * @param itemId - the Workshop item to update
   * @param previewPath - absolute path of an existing image file
   * @param appId - defaults to the app id the client was initialized with
   * @param changeNote - optional change note shown in the item's change history
   */
  export function updateItemPreview(itemId: bigint, previewPath: string, appId?: number | undefined | null, changeNote?: string | undefined | null): Promise<UgcResult>
  /**
   * Upload only the content folder of a Workshop item.
   *
   * The preview image is not touched, and the title, description, tags and visibility stay as
   * they are.
   *
   * @param itemId - the Workshop item to update
   * @param contentPath - absolute path of an existing folder with the mod files
   * @param appId - defaults to the app id the client was initialized with
   * @param changeNote - optional change note shown in the item's change history
   */
  export function updateItemContent(itemId: bigint, contentPath: string, appId?: number | undefined | null, changeNote?: string | undefined | null): Promise<UgcResult>
  /**
   * Updates an existing Workshop item on Steam, like `updateItem`, but reports the outcome through
   * callbacks instead of a promise. The call returns at once; the work continues in the background.
   * Its fields are checked the same way as in `updateItem`.
   *
   * `successCallback` receives the `UgcResult`. `errorCallback` receives every failure, both the
   * check that runs before anything is sent and the errors Steam reports later. Nothing is thrown.
   *
   * `progressCallback` receives an `UpdateProgress` right away and then every
   * `progressCallbackIntervalMs`, until the status is `Invalid` or `CommittingChanges`. The units of
   * `progress` and `total` are unverified against a live Steam client.
   *
   * Once submitted, the change is applied to the item on Steam and cannot be cancelled. A running,
   * logged-in Steam client is needed.
   *
   * @param itemId - the Workshop item to update (its published file id)
   * @param updateDetails - the fields to change; see `UgcUpdate`
   * @param appId - defaults to the app id the client was initialized with
   * @param successCallback - called with the `UgcResult` when Steam completes the update
   * @param errorCallback - called with an `Error` when the update is refused or fails
   * @param progressCallback - optional; called with the `UpdateProgress` while the update runs
   * @param progressCallbackIntervalMs - milliseconds between progress reports; defaults to 1000
   */
  export function updateItemWithCallback(itemId: bigint, updateDetails: UgcUpdate, appId: number | undefined | null, successCallback: (data: UgcResult) => void, errorCallback: (err: any) => void, progressCallback?: (data: UpdateProgress) => void, progressCallbackIntervalMs?: number | undefined | null): void
  /**
   * Subscribe to a workshop item. It will be downloaded and installed as soon as possible.
   *
   * {@link https://partner.steamgames.com/doc/api/ISteamUGC#SubscribeItem}
   */
  export function subscribe(itemId: bigint): Promise<void>
  /**
   * Unsubscribe from a workshop item. This will result in the item being removed after the game quits.
   *
   * {@link https://partner.steamgames.com/doc/api/ISteamUGC#UnsubscribeItem}
   */
  export function unsubscribe(itemId: bigint): Promise<void>
  /**
   * Gets the current state of a workshop item on this client. States can be combined.
   *
   * @returns a number with the current item state, e.g. 9
   * 9 = 1 (The current user is subscribed to this item) + 8 (The item needs an update)
   *
   * {@link https://partner.steamgames.com/doc/api/ISteamUGC#GetItemState}
   * {@link https://partner.steamgames.com/doc/api/ISteamUGC#EItemState}
   */
  export function state(itemId: bigint): number
  /**
   * Gets info about currently installed content on the disc for workshop item.
   *
   * @returns an object with the the properties {folder, size_on_disk, timestamp}
   *
   * {@link https://partner.steamgames.com/doc/api/ISteamUGC#GetItemInstallInfo}
   */
  export function installInfo(itemId: bigint): InstallInfo | null
  /**
   * Get info about a pending download of a workshop item.
   *
   * @returns an object with the properties {current, total}
   *
   * {@link https://partner.steamgames.com/doc/api/ISteamUGC#GetItemDownloadInfo}
   */
  export function downloadInfo(itemId: bigint): DownloadInfo | null
  /**
   * Download or update a workshop item.
   *
   * @param highPriority - If high priority is true, start the download in high priority mode, pausing any existing in-progress Steam downloads and immediately begin downloading this workshop item.
   * @returns true or false
   *
   * {@link https://partner.steamgames.com/doc/api/ISteamUGC#DownloadItem}
   */
  export function download(itemId: bigint, highPriority: boolean): boolean
  /**
   * Get all subscribed workshop items.
   * @returns an array of subscribed workshop item ids
   */
  export function getSubscribedItems(): Array<bigint>
  /**
   * Permanently deletes a Workshop item on Steam. The item is removed from the Workshop; the deletion
   * cannot be cancelled once it has been sent. A running, logged-in Steam client is needed.
   *
   * The code does not check ownership first; Steam decides whether the account may delete the item.
   *
   * Resolves with no value once Steam confirms the deletion. Rejects when Steam returns an error, or
   * when no completion arrives; in that last case the outcome is unknown, so read the item before
   * retrying.
   *
   * @param itemId - the Workshop item to delete (its published file id)
   * @returns resolves with no value once Steam confirms the deletion
   */
  export function deleteItem(itemId: bigint): Promise<void>
  /**
   * Marks `childId` as a required item of `parentId`. Resolves with the Steam result code, where `1` is
   * OK. A non-OK code (for example a missing child or a denied request) resolves rather than rejects.
   * Rejects on an invalid id (checked before any Steam call), an I/O failure, or a lost completion.
   */
  export function addDependency(parentId: bigint, childId: bigint): Promise<number>
  /**
   * Removes the required-item dependency from `parentId` to `childId`. Resolves with the Steam result
   * code (`1` is OK), with the same validation and rejection rules as `addDependency`.
   */
  export function removeDependency(parentId: bigint, childId: bigint): Promise<number>
  /** The user's vote on a Workshop item, as Steam reports it. */
  export interface UserItemVoteState {
    votedUp: boolean
    votedDown: boolean
    /** The user has neither voted up nor down. */
    skipped: boolean
  }
  /**
   * The app dependencies of a Workshop item. When `appIds` is shorter than
   * `totalAppDependencies`, the list is incomplete.
   */
  export interface AppDependencies {
    /** Steam result code; `1` is OK. */
    result: number
    appIds: Array<number>
    totalAppDependencies: number
  }
  /**
   * Votes for (`voteUp` true) or against a Workshop item as the current user.
   *
   * **Changes the user's vote on Steam.** Resolves when Steam confirms the vote.
   *
   * @param itemId - the Workshop item
   * @param voteUp - true to vote up, false to vote down
   */
  export function setUserItemVote(itemId: bigint, voteUp: boolean): Promise<void>
  /** Reads the current user's vote on a Workshop item. Read-only. */
  export function getUserItemVote(itemId: bigint): Promise<UserItemVoteState>
  /**
   * Adds a Workshop item to the current user's favorites.
   *
   * **Changes the user's favorites on Steam.**
   *
   * @param itemId - the Workshop item
   * @param appId - defaults to the app id the client was initialized with
   */
  export function addItemToFavorites(itemId: bigint, appId?: number | undefined | null): Promise<void>
  /**
   * Removes a Workshop item from the current user's favorites.
   *
   * **Changes the user's favorites on Steam.**
   *
   * @param itemId - the Workshop item
   * @param appId - defaults to the app id the client was initialized with
   */
  export function removeItemFromFavorites(itemId: bigint, appId?: number | undefined | null): Promise<void>
  /**
   * Starts playtime tracking for Workshop items. The list must not be empty.
   *
   * **Changes the user's playtime records on Steam.**
   *
   * @param itemIds - the Workshop items
   */
  export function startPlaytimeTracking(itemIds: Array<bigint>): Promise<void>
  /**
   * Stops playtime tracking for Workshop items. The list must not be empty.
   *
   * **Changes the user's playtime records on Steam.**
   *
   * @param itemIds - the Workshop items
   */
  export function stopPlaytimeTracking(itemIds: Array<bigint>): Promise<void>
  /**
   * Adds `appId` as an app dependency of a Workshop item (for example a DLC the item needs).
   * Resolves with the Steam result code, where `1` is OK. A non-OK code resolves rather than rejects.
   *
   * **Changes the item's remote state.**
   */
  export function addAppDependency(itemId: bigint, appId: number): Promise<number>
  /**
   * Removes `appId` from the app dependencies of a Workshop item. Resolves with the Steam result code
   * (`1` is OK), with the same rules as `addAppDependency`.
   *
   * **Changes the item's remote state.**
   */
  export function removeAppDependency(itemId: bigint, appId: number): Promise<number>
  /**
   * Reads every app dependency of a Workshop item. Steam sends them in pages; they are collected
   * until the reported total is reached. Read-only.
   *
   * Not verified against a live Steam client: see the paging note in steamworks-rs.
   */
  export function getAppDependencies(itemId: bigint): Promise<AppDependencies>
  export const enum UGCQueryType {
    RankedByVote = 0,
    RankedByPublicationDate = 1,
    AcceptedForGameRankedByAcceptanceDate = 2,
    RankedByTrend = 3,
    FavoritedByFriendsRankedByPublicationDate = 4,
    CreatedByFriendsRankedByPublicationDate = 5,
    RankedByNumTimesReported = 6,
    CreatedByFollowedUsersRankedByPublicationDate = 7,
    NotYetRated = 8,
    RankedByTotalVotesAsc = 9,
    RankedByVotesUp = 10,
    RankedByTextSearch = 11,
    RankedByTotalUniqueSubscriptions = 12,
    RankedByPlaytimeTrend = 13,
    RankedByTotalPlaytime = 14,
    RankedByAveragePlaytimeTrend = 15,
    RankedByLifetimeAveragePlaytime = 16,
    RankedByPlaytimeSessionsTrend = 17,
    RankedByLifetimePlaytimeSessions = 18,
    RankedByLastUpdatedDate = 19
  }
  export const enum UGCType {
    Items = 0,
    ItemsMtx = 1,
    ItemsReadyToUse = 2,
    Collections = 3,
    Artwork = 4,
    Videos = 5,
    Screenshots = 6,
    AllGuides = 7,
    WebGuides = 8,
    IntegratedGuides = 9,
    UsableInGame = 10,
    ControllerBindings = 11,
    GameManagedItems = 12,
    All = 13
  }
  export const enum UserListType {
    Published = 0,
    VotedOn = 1,
    VotedUp = 2,
    VotedDown = 3,
    Favorited = 4,
    Subscribed = 5,
    UsedOrPlayed = 6,
    Followed = 7
  }
  export const enum UserListOrder {
    CreationOrderAsc = 0,
    CreationOrderDesc = 1,
    TitleAsc = 2,
    LastUpdatedDesc = 3,
    SubscriptionDateDesc = 4,
    VoteScoreDesc = 5,
    ForModeration = 6
  }
  export interface WorkshopItemStatistic {
    numSubscriptions?: bigint
    numFavorites?: bigint
    numFollowers?: bigint
    numUniqueSubscriptions?: bigint
    numUniqueFavorites?: bigint
    numUniqueFollowers?: bigint
    numUniqueWebsiteViews?: bigint
    reportScore?: bigint
    numSecondsPlayed?: bigint
    numPlaytimeSessions?: bigint
    numComments?: bigint
    numSecondsPlayedDuringTimePeriod?: bigint
    numPlaytimeSessionsDuringTimePeriod?: bigint
  }
  /**
   * Preview types for workshop item additional previews.
   * See: https://partner.steamgames.com/doc/api/ISteamUGC#EItemPreviewType
   */
  export const enum ItemPreviewType {
    /** Standard image file (e.g., jpg, png, gif, etc.) */
    Image = 0,
    /** YouTube video ID is stored */
    YouTubeVideo = 1,
    /** Sketchfab model ID is stored */
    Sketchfab = 2,
    /** Cube map in horizontal cross layout */
    EnvironmentMapHorizontalCross = 3,
    /** Environment map in latitude/longitude format */
    EnvironmentMapLatLong = 4,
    /** Clip ID is stored */
    Clip = 5,
    /** Reserved max value for custom types */
    ReservedMax = 255
  }
  /** Additional preview media for a workshop item. */
  export interface AdditionalPreview {
    /** URL or video ID for the preview (e.g., YouTube video ID, Sketchfab model ID, or image URL) */
    urlOrVideoId: string
    /** Original filename of the preview */
    originalFilename: string
    /** Type of preview (image, video, sketchfab model, etc.) */
    previewType: ItemPreviewType
  }
  /**
   * A game version (Steam branch) range a Workshop item is valid for.
   * `minBranch` / `maxBranch` are branch names such as `open_beta`. An open end is left out
   * (`undefined`): no `minBranch` starts at the earliest branch, no `maxBranch` runs through the newest.
   */
  export interface SupportedGameVersion {
    minBranch?: string
    maxBranch?: string
  }
  export interface WorkshopItem {
    /** The Workshop item's published file id. */
    publishedFileId: bigint
    /** The app id that created the item. */
    creatorAppId?: number
    /** The app id that uses the item. */
    consumerAppId?: number
    /** The item's title. */
    title: string
    /** The item's description. */
    description: string
    /** The Steam account that owns the item. */
    owner: PlayerSteamId
    /** Time created in unix epoch seconds format */
    timeCreated: number
    /** Time updated in unix epoch seconds format */
    timeUpdated: number
    /** Time when the user added the published item to their list (not always applicable), provided in Unix epoch format (time since Jan 1st, 1970). */
    timeAddedToUserList: number
    /** Who can see the item: Public, FriendsOnly, Private or Unlisted. */
    visibility: UgcItemVisibility
    /** Whether Steam has banned the item. */
    banned: boolean
    /** Whether Steam has accepted the item for use. */
    acceptedForUse: boolean
    /** The item's tags. */
    tags: Array<string>
    /** Whether Steam cut the tag list short. */
    tagsTruncated: boolean
    url: string
    /** Number of upvotes the item has. */
    numUpvotes: number
    /** Number of downvotes the item has. */
    numDownvotes: number
    /** Number of required items the item has. */
    numChildren: number
    /** URL of the item's main preview image, when Steam returns one. */
    previewUrl?: string
    /** Counts for the item, such as subscriptions and favorites. */
    statistics: WorkshopItemStatistic
    /** Ids of the item's required items. Present only with `returnChildren`. */
    children?: Array<bigint>
    /** Additional preview media (images, videos, etc.) for the workshop item */
    additionalPreviews?: Array<AdditionalPreview>
    /** Game versions (Steam branches) the item is valid for. Empty when Steam returns no range. */
    supportedGameVersions: Array<SupportedGameVersion>
  }
  export interface WorkshopPaginatedResult {
    /** The entries of this page; `null` where Steam returned no record. */
    items: Array<WorkshopItem | undefined | null>
    /** The number of entries Steam returned on this page. */
    returnedResults: number
    /** The number of matches across all pages. */
    totalResults: number
    /** Whether the answer came from Steam's cache. */
    wasCached: boolean
  }
  export interface WorkshopItemsResult {
    /** One entry per record Steam returned; `null` where Steam returned no record. */
    items: Array<WorkshopItem | undefined | null>
    /** Whether the answer came from Steam's cache. */
    wasCached: boolean
  }
  export interface WorkshopItemQueryConfig {
    /** Oldest cached answer Steam may return, in seconds. */
    cachedResponseMaxAge?: number
    /** Return the item's developer metadata. */
    includeMetadata?: boolean
    /** Return the long description of the item. */
    includeLongDescription?: boolean
    /** Fill `additionalPreviews` on each returned item. */
    includeAdditionalPreviews?: boolean
    /** Return only the item ids, not the item details. */
    onlyIds?: boolean
    /** Return only the total number of matches. */
    onlyTotal?: boolean
    /** Steam language code for the returned title and description, such as `schinese`. */
    language?: string
    /** Match items that have any of the required tags, instead of all of them. */
    matchAnyTag?: boolean
    /** Tags an item must have. */
    requiredTags?: Array<string>
    /** Tags an item must not have. */
    excludedTags?: Array<string>
    /** Full-text search string. */
    searchText?: string
    /** Number of days considered when ranking items by trend. */
    rankedByTrendDays?: number
    /** Fill `children` with the ids of each item's required items. */
    returnChildren?: boolean
  }
  export interface AppIDs {
    creator?: number
    consumer?: number
  }
  /**
   * Gets one Workshop item by its published file id. The query runs through the Steam client, so a
   * running Steam client is needed. Whether a logged-in account is also required is unverified
   * against a live Steam client.
   *
   * Resolves with the item, or with `null` when the query returns no record for the id. The optional
   * `children` field is filled only with `returnChildren`, and `additionalPreviews` only with
   * `includeAdditionalPreviews`. Rejects when the query cannot be created or Steam returns an error.
   *
   * @param item - the Workshop item to read (its published file id)
   * @param queryConfig - optional query options; see `WorkshopItemQueryConfig`. Omitted, no options are set.
   * @returns the item, or `null` when the query returned no record for the id
   */
  export function getItem(item: bigint, queryConfig?: WorkshopItemQueryConfig | undefined | null): Promise<WorkshopItem | null>
  /**
   * Gets several Workshop items in one query. The query runs through the Steam client, so a running
   * Steam client is needed. Whether a logged-in account is also required is unverified against a
   * live Steam client.
   *
   * Resolves with `items` and `wasCached`. `items` has one entry per record Steam returned, and an
   * entry is `null` where Steam returned no record. The entries are not matched back to the input
   * ids, so use each item's `publishedFileId` to match them. Rejects when the query cannot be created
   * or Steam returns an error.
   *
   * @param items - the published file ids to read
   * @param queryConfig - optional query options; see `WorkshopItemQueryConfig`. Omitted, no options are set.
   * @returns `items`, and `wasCached` for whether the answer came from Steam's cache
   */
  export function getItems(items: Array<bigint>, queryConfig?: WorkshopItemQueryConfig | undefined | null): Promise<WorkshopItemsResult>
  /**
   * Queries one page of all Workshop items that match the given type, ranking and app ids. The query
   * runs through the Steam client, so a running Steam client is needed. Whether a logged-in account
   * is also required is unverified against a live Steam client.
   *
   * Resolves with `items` for this page, `returnedResults` (the number of entries on this page),
   * `totalResults` (the matches across all pages) and `wasCached`. Entries are `null` where Steam
   * returned no record. To read everything, keep requesting pages while the collected count is below
   * `totalResults` and the last page returned items. The page size is set by Steam; the README and
   * the skill give 50 per page, unverified against a live Steam client. Rejects when the query cannot
   * be created or Steam returns an error.
   *
   * @param page - the page to read, passed to Steam as given; the first page index is unverified against a live Steam client
   * @param queryType - the ranking and filter of the query, a `UGCQueryType` value such as `RankedByPublicationDate`
   * @param itemType - the kind of item to list, a `UGCType` value such as `Items`
   * @param creatorAppId - the app id that created the items
   * @param consumerAppId - the app id that uses the items; Steam filters by both app ids
   * @param queryConfig - optional query options; see `WorkshopItemQueryConfig`. Omitted, no options are set.
   * @returns the page of items with `returnedResults`, `totalResults` and `wasCached`
   */
  export function getAllItems(page: number, queryType: UGCQueryType, itemType: UGCType, creatorAppId: number, consumerAppId: number, queryConfig?: WorkshopItemQueryConfig | undefined | null): Promise<WorkshopPaginatedResult>
  /**
   * Queries one page of the Workshop items related to one user, such as their published, subscribed or
   * favorited items. The query runs through the Steam client, so a running Steam client is needed.
   * Whether a logged-in account is also required is unverified against a live Steam client.
   *
   * Resolves with the same fields as `getAllItems`: `items` for this page, `returnedResults`,
   * `totalResults` and `wasCached`. Entries are `null` where Steam returned no record. Paging works as
   * described for `getAllItems`. Rejects when the query cannot be created or Steam returns an error.
   *
   * @param page - the page to read, passed to Steam as given; the first page index is unverified against a live Steam client
   * @param accountId - the 32-bit account id of the user (the lower 32 bits of their SteamID64)
   * @param listType - which list to read, a `UserListType` value such as `Published` or `Subscribed`
   * @param itemType - the kind of item to list, a `UGCType` value such as `Items`
   * @param sortOrder - the order of the list, a `UserListOrder` value such as `LastUpdatedDesc`
   * @param appIds - the `creator` and `consumer` app ids; a missing one is sent as `0`, and what Steam does with `0` is unverified
   * @param queryConfig - optional query options; see `WorkshopItemQueryConfig`. Omitted, no options are set.
   * @returns the page of items with `returnedResults`, `totalResults` and `wasCached`
   */
  export function getUserItems(page: number, accountId: number, listType: UserListType, itemType: UGCType, sortOrder: UserListOrder, appIds: AppIDs, queryConfig?: WorkshopItemQueryConfig | undefined | null): Promise<WorkshopPaginatedResult>
}
