import client = require('./client')

export const enum ChatMemberStateChange {
    /** This user has joined or is joining the lobby. */
    Entered,
    /** This user has left or is leaving the lobby. */
    Left,
    /** User disconnected without leaving the lobby first. */
    Disconnected,
    /** The user has been kicked. */
    Kicked,
    /** The user has been kicked and banned. */
    Banned,
}

/**
 * Serde form of steamworks-rs `SteamError`: a unit variant name such as `"NoConnection"`,
 * or `{ UnknownResult: code }` for a Steam result code that has no name.
 */
export type SteamErrorName = string | { UnknownResult: number }

/** Serde form of `Result<(), SteamError>`: `{ Ok: null }` on success, `{ Err: ... }` on failure. */
export type SteamResult = { Ok: null } | { Err: SteamErrorName }

/** Serde form of steamworks-rs `ChatEntryType` (a unit variant name). */
export type ChatEntryTypeName =
    | 'Invalid'
    | 'ChatMsg'
    | 'Typing'
    | 'InviteGame'
    | 'Emote'
    | 'LeftConversation'
    | 'Entered'
    | 'WasKicked'
    | 'WasBanned'
    | 'Disconnected'
    | 'HistoricalChat'
    | 'LinkBlocked'

/** Serde form of steamworks-rs `ChatRoomEnterResponse` (a unit variant name). */
export type ChatRoomEnterResponseName =
    | 'Success'
    | 'DoesntExist'
    | 'NotAllowed'
    | 'Full'
    | 'Error'
    | 'Banned'
    | 'Limited'
    | 'ClanDisabled'
    | 'CommunityBan'
    | 'MemberBlockedYou'
    | 'YouBlockedMember'
    | 'RatelimitExceeded'

/** Serde form of steamworks-rs `AuthSessionValidateError` (a unit variant name). */
export type AuthSessionValidateErrorName =
    | 'UserNotConnectedToSteam'
    | 'NoLicenseOrExpired'
    | 'VACBanned'
    | 'LoggedInElseWhere'
    | 'VACCheckTimedOut'
    | 'AuthTicketCancelled'
    | 'AuthTicketInvalidAlreadyUsed'
    | 'AuthTicketInvalid'
    | 'PublisherIssuedBan'

/**
 * Measured with napi-rs 2.16 (`serde-json` and `napi6` features): a JSON integer within
 * +/-(2^53 - 1) reaches JavaScript as a `number`, and a larger one as a `bigint`.
 * SteamIDs, lobby IDs and friend IDs are always beyond 2^53, so they are `bigint`.
 * `GameId` and `PublishedFileId` are `u64` values that may be small, so they are `number | bigint`.
 */
export interface CallbackReturns {
    [client.callback.SteamCallback.PersonaStateChange]: {
        steam_id: bigint
        flags: { bits: number }
    }
    [client.callback.SteamCallback.SteamServersConnected]: {}
    [client.callback.SteamCallback.SteamServersDisconnected]: {
        reason: number
    }
    [client.callback.SteamCallback.SteamServerConnectFailure]: {
        reason: number
        still_retrying: boolean
    }
    [client.callback.SteamCallback.LobbyDataUpdate]: {
        lobby: bigint
        member: bigint
        success: boolean
    }
    [client.callback.SteamCallback.LobbyChatUpdate]: {
        lobby: bigint
        user_changed: bigint
        making_change: bigint
        member_state_change: ChatMemberStateChange
    }
    [client.callback.SteamCallback.P2PSessionRequest]: {
        remote: bigint
    }
    [client.callback.SteamCallback.P2PSessionConnectFail]: {
        remote: bigint
        error: number
    }
    [client.callback.SteamCallback.GameLobbyJoinRequested]: {
        lobby_steam_id: bigint
        friend_steam_id: bigint
    }
    [client.callback.SteamCallback.MicroTxnAuthorizationResponse]: {
        app_id: number
        order_id: number | bigint
        authorized: boolean
    }
    [client.callback.SteamCallback.DownloadItemResult]: {
        app_id: number
        published_file_id: number | bigint
        /** `null` when the item downloaded without error. */
        error: SteamErrorName | null
    }
    [client.callback.SteamCallback.UserStatsReceived]: {
        steam_id: bigint
        game_id: number | bigint
        result: SteamResult
    }
    [client.callback.SteamCallback.UserStatsStored]: {
        game_id: number | bigint
        result: SteamResult
    }
    [client.callback.SteamCallback.UserAchievementStored]: {
        game_id: number | bigint
        achievement_name: string
        current_progress: number
        max_progress: number
    }
    [client.callback.SteamCallback.GameOverlayActivated]: {
        active: boolean
    }
    [client.callback.SteamCallback.GameRichPresenceJoinRequested]: {
        friend_steam_id: bigint
        connect: string
    }
    [client.callback.SteamCallback.LobbyEnter]: {
        lobby: bigint
        chat_permissions: number
        blocked: boolean
        chat_room_enter_response: ChatRoomEnterResponseName
    }
    [client.callback.SteamCallback.LobbyChatMsg]: {
        lobby: bigint
        user: bigint
        chat_entry_type: ChatEntryTypeName
        chat_id: number
    }
    /** Unit struct: serialises to `null`. */
    [client.callback.SteamCallback.ScreenshotRequested]: null
    [client.callback.SteamCallback.ScreenshotReady]: {
        /** `{ Ok: handle }` with the library handle, or `{ Err: ... }` when the screenshot could not be saved. */
        local_handle: { Ok: number } | { Err: 'Fail' | 'IoFailure' }
    }
    /** Unit struct: serialises to `null`. */
    [client.callback.SteamCallback.NewUrlLaunchParameters]: null
    [client.callback.SteamCallback.AuthSessionTicketResponse]: {
        ticket: number
        result: SteamResult
    }
    [client.callback.SteamCallback.ValidateAuthTicketResponse]: {
        steam_id: bigint
        response: { Ok: null } | { Err: AuthSessionValidateErrorName }
        owner_steam_id: bigint
    }
}
