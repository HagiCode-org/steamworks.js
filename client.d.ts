export declare function init(appId?: number | undefined | null): void
export declare function restartAppIfNecessary(appId: number): boolean
export declare function runCallbacks(): void
export declare function shutdown(): void
export declare function isConnected(): boolean
export interface PlayerSteamId {
  steamId64: bigint
  steamId32: string
  accountId: number
}
export declare namespace achievement {
  export function activate(achievement: string): boolean
  export function isActivated(achievement: string): boolean
  export function clear(achievement: string): boolean
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
}
export declare namespace apps {
  export function isSubscribedApp(appId: number): boolean
  export function isAppInstalled(appId: number): boolean
  export function isDlcInstalled(appId: number): boolean
  export function isSubscribedFromFreeWeekend(): boolean
  export function isVacBanned(): boolean
  export function isCybercafe(): boolean
  export function isLowViolence(): boolean
  export function isSubscribed(): boolean
  export function appBuildId(): number
  export function appInstallDir(appId: number): string
  export function appOwner(): PlayerSteamId
  export function availableGameLanguages(): Array<string>
  export function currentGameLanguage(): string
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
  export function getAuthTicketForWebApi(identity: string, timeoutSeconds?: number | undefined | null): Promise<Ticket>
  export class Ticket {
    cancel(): void
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
  export function register<C extends keyof import('./callbacks').CallbackReturns>(steamCallback: C, handler: (value: import('./callbacks').CallbackReturns[C]) => void): Handle
  export class Handle {
    disconnect(): void
  }
}
export declare namespace cloud {
  export function isEnabledForAccount(): boolean
  export function isEnabledForApp(): boolean
  export function setEnabledForApp(enabled: boolean): void
  export function readFile(name: string): string
  export function writeFile(name: string, content: string): boolean
  export function deleteFile(name: string): boolean
  export function fileExists(name: string): boolean
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
  export function getFriendState(steamId64: bigint): FriendState
  /** @returns the AppID of the game the friend is playing, or `null` when they are not in a game */
  export function getFriendGamePlayed(steamId64: bigint): number | null
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
  export function init(): void
  export function getControllers(): Array<Controller>
  export function getActionSet(actionSetName: string): bigint
  export function getDigitalAction(actionName: string): bigint
  export function getAnalogAction(actionName: string): bigint
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
    activateActionSet(actionSetHandle: bigint): void
    isDigitalActionPressed(actionHandle: bigint): boolean
    getAnalogActionVector(actionHandle: bigint): AnalogActionVector
    getType(): InputType
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
  export function getSteamId(): PlayerSteamId
  export function getName(): string
  export function getLevel(): number
  /** @returns the 2 digit ISO 3166-1-alpha-2 format country code which client is running in, e.g. "US" or "UK". */
  export function getIpCountry(): string
  export function setRichPresence(key: string, value?: string | undefined | null): void
}
export declare namespace matchmaking {
  export const enum LobbyType {
    Private = 0,
    FriendsOnly = 1,
    Public = 2,
    Invisible = 3
  }
  export function createLobby(lobbyType: LobbyType, maxMembers: number): Promise<Lobby>
  export function joinLobby(lobbyId: bigint): Promise<Lobby>
  export function getLobbies(): Promise<Array<Lobby>>
  export class Lobby {
    id: bigint
    join(): Promise<Lobby>
    leave(): void
    openInviteDialog(): void
    getMemberCount(): bigint
    getMemberLimit(): bigint | null
    getMembers(): Array<PlayerSteamId>
    getOwner(): PlayerSteamId
    setJoinable(joinable: boolean): boolean
    getData(key: string): string | null
    setData(key: string, value: string): boolean
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
  export function sendP2PPacket(steamId64: bigint, sendType: SendType, data: Buffer): boolean
  export function isP2PPacketAvailable(): number
  export function readP2PPacket(size: number): P2PPacket
  export function acceptP2PSession(steamId64: bigint): void
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
    Friends = 0,
    Community = 1,
    Players = 2,
    Settings = 3,
    OfficialGameGroup = 4,
    Stats = 5,
    Achievements = 6
  }
  export const enum StoreFlag {
    None = 0,
    AddToCart = 1,
    AddToCartAndShow = 2
  }
  export function activateDialog(dialog: Dialog): void
  export function activateDialogToUser(dialog: Dialog, steamId64: bigint): void
  export function activateInviteDialog(lobbyId: bigint): void
  export function activateToWebPage(url: string): void
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
  export function getInt(name: string): number | null
  export function setInt(name: string, value: number): boolean
  export function store(): boolean
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
  export function getAppId(): number
  export function getServerRealTime(): number
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
    itemId: bigint
    needsToAcceptAgreement: boolean
  }
  export const enum UgcItemVisibility {
    Public = 0,
    FriendsOnly = 1,
    Private = 2,
    Unlisted = 3
  }
  export interface UgcUpdate {
    title?: string
    description?: string
    changeNote?: string
    previewPath?: string
    /** Image files appended to the item's additional previews (screenshots). */
    additionalPreviewPaths?: Array<string>
    /** 0-based indexes of additional previews to remove, as listed in `additionalPreviews`. */
    removeAdditionalPreviewIndexes?: Array<number>
    contentPath?: string
    tags?: Array<string>
    visibility?: UgcItemVisibility
    language?: string
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
  export function createItem(appId?: number | undefined | null): Promise<UgcResult>
  export function updateItem(itemId: bigint, updateDetails: UgcUpdate, appId?: number | undefined | null): Promise<UgcResult>
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
  export interface WorkshopItem {
    publishedFileId: bigint
    creatorAppId?: number
    consumerAppId?: number
    title: string
    description: string
    owner: PlayerSteamId
    /** Time created in unix epoch seconds format */
    timeCreated: number
    /** Time updated in unix epoch seconds format */
    timeUpdated: number
    /** Time when the user added the published item to their list (not always applicable), provided in Unix epoch format (time since Jan 1st, 1970). */
    timeAddedToUserList: number
    visibility: UgcItemVisibility
    banned: boolean
    acceptedForUse: boolean
    tags: Array<string>
    tagsTruncated: boolean
    url: string
    numUpvotes: number
    numDownvotes: number
    numChildren: number
    previewUrl?: string
    statistics: WorkshopItemStatistic
    children?: Array<bigint>
    /** Additional preview media (images, videos, etc.) for the workshop item */
    additionalPreviews?: Array<AdditionalPreview>
  }
  export interface WorkshopPaginatedResult {
    items: Array<WorkshopItem | undefined | null>
    returnedResults: number
    totalResults: number
    wasCached: boolean
  }
  export interface WorkshopItemsResult {
    items: Array<WorkshopItem | undefined | null>
    wasCached: boolean
  }
  export interface WorkshopItemQueryConfig {
    cachedResponseMaxAge?: number
    includeMetadata?: boolean
    includeLongDescription?: boolean
    includeAdditionalPreviews?: boolean
    onlyIds?: boolean
    onlyTotal?: boolean
    language?: string
    matchAnyTag?: boolean
    requiredTags?: Array<string>
    excludedTags?: Array<string>
    searchText?: string
    rankedByTrendDays?: number
    returnChildren?: boolean
  }
  export interface AppIDs {
    creator?: number
    consumer?: number
  }
  export function getItem(item: bigint, queryConfig?: WorkshopItemQueryConfig | undefined | null): Promise<WorkshopItem | null>
  export function getItems(items: Array<bigint>, queryConfig?: WorkshopItemQueryConfig | undefined | null): Promise<WorkshopItemsResult>
  export function getAllItems(page: number, queryType: UGCQueryType, itemType: UGCType, creatorAppId: number, consumerAppId: number, queryConfig?: WorkshopItemQueryConfig | undefined | null): Promise<WorkshopPaginatedResult>
  export function getUserItems(page: number, accountId: number, listType: UserListType, itemType: UGCType, sortOrder: UserListOrder, appIds: AppIDs, queryConfig?: WorkshopItemQueryConfig | undefined | null): Promise<WorkshopPaginatedResult>
}
