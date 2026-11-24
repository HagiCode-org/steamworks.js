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
}
export declare namespace apps {
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
    ValidateAuthTicketResponse = 22
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
  export class FileInfo {
    name: string
    size: bigint
  }
}
export declare namespace friends {
  export interface FriendInfo {
    steamId64: bigint
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
  /** @returns the AppID of the game the friend is playing, or `null` when they are not in a game */
  export function getFriendGamePlayed(steamId64: bigint): number | null
  /**
   * Returns the most recent co-play record between the local user and a friend.
   * @param steamId64 - SteamID64 of the friend, as a BigInt
   * @returns `appId` of the game played together (`0` when there is none) and `time`, the seconds since they last played together
   */
  export function getFriendCoplayInfo(steamId64: bigint): CoplayInfo
  /** @returns the small (32x32) avatar as RGBA pixels, or `null` when it has not been loaded */
  export function getSmallAvatar(steamId64: bigint): Buffer | null
  /** @returns the medium (64x64) avatar as RGBA pixels, or `null` when it has not been loaded */
  export function getMediumAvatar(steamId64: bigint): Buffer | null
  /** @returns the large (184x184) avatar as RGBA pixels, or `null` when it has not been loaded */
  export function getLargeAvatar(steamId64: bigint): Buffer | null
  /** @returns true when Steam will fetch the user information asynchronously (PersonaStateChange follows) */
  export function requestUserInformation(steamId64: bigint, nameOnly: boolean): boolean
  /** Clears all of the local user's Rich Presence keys (see `localplayer.setRichPresence`). */
  export function clearRichPresence(): void
  /** Sends a game invite that carries `connectString` to the friend. */
  export function inviteUserToGame(steamId64: bigint, connectString: string): void
  /** Marks the user as played with. The local user must currently be in game with them. */
  export function setPlayedWith(steamId64: bigint): void
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
  }
}
export declare namespace localplayer {
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
}
export declare namespace utils {
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
