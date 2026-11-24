use napi_derive::napi;

#[napi]
pub mod friends {
    use crate::api::workshop::workshop::await_completion;
    use napi::bindgen_prelude::{BigInt, Buffer, Error};
    use steamworks::{Friend, FriendFlags, FriendsGroupId, LobbyId, SteamId};
    use tokio::sync::oneshot;

    #[napi(object)]
    pub struct FriendInfo {
        /// The user's SteamID64, as a BigInt.
        pub steam_id64: BigInt,
        /// The user's display name.
        pub name: String,
        /// The nickname the local user set for this friend, or `null` when none is set.
        #[napi(ts_type = "string | null")]
        pub nick_name: Option<String>,
    }

    #[napi(object)]
    pub struct CoplayInfo {
        /// AppID of the game played together, `0` when there is none.
        pub app_id: u32,
        /// Seconds since the local user last played with this user.
        pub time: i32,
    }

    #[napi]
    pub enum FriendState {
        Offline,
        Online,
        Invisible,
        Busy,
        Away,
        Snooze,
        LookingToPlay,
        LookingToTrade,
    }

    /// The relationship between the local user and another user (`EFriendRelationship`).
    #[napi]
    pub enum FriendRelationship {
        /// No relationship.
        None = 0,
        /// The user is blocked.
        Blocked = 1,
        /// The user has sent the local user a friend request.
        RequestRecipient = 2,
        /// The user is a friend.
        Friend = 3,
        /// The local user has sent the user a friend request.
        RequestInitiator = 4,
        /// The local user ignores this user.
        Ignored = 5,
        /// The user is a friend that the local user ignores.
        IgnoredFriend = 6,
    }

    /// The kind of a chat entry (`EChatEntryType`), as the SDK numbers it.
    #[napi]
    pub enum ChatEntryType {
        /// Not a valid entry, or a value this binding does not name.
        Invalid = 0,
        /// A chat message.
        ChatMsg = 1,
        /// The user is typing.
        Typing = 2,
        /// A game invite.
        InviteGame = 3,
        /// An emote.
        Emote = 4,
        /// The user left the conversation.
        LeftConversation = 6,
        /// The user entered the chat room.
        Entered = 7,
        /// The user was kicked.
        WasKicked = 8,
        /// The user was banned.
        WasBanned = 9,
        /// The user disconnected.
        Disconnected = 10,
        /// A message from the chat history.
        HistoricalChat = 11,
        /// A link that Steam blocked.
        LinkBlocked = 14,
    }

    /// The answer of a clan chat room to a join request (`EChatRoomEnterResponse`).
    #[napi]
    pub enum ChatRoomEnterResponse {
        /// The join worked. Any other value means the game is not in the room.
        Success = 1,
        /// The room does not exist.
        DoesntExist = 2,
        /// The user may not join.
        NotAllowed = 3,
        /// The room is full.
        Full = 4,
        /// Steam reported an error.
        Error = 5,
        /// The user is banned from the room.
        Banned = 6,
        /// The user is limited from joining.
        Limited = 7,
        /// The clan chat is disabled.
        ClanDisabled = 8,
        /// The user is banned from the community.
        CommunityBan = 9,
        /// A member of the room has blocked the user.
        MemberBlockedYou = 10,
        /// The user has blocked a member of the room.
        YouBlockedMember = 11,
        /// Too many join requests.
        RatelimitExceeded = 12,
    }

    /// The kind of a Community profile item (`ECommunityProfileItemType`).
    #[napi]
    pub enum ProfileItemType {
        AnimatedAvatar = 0,
        AvatarFrame = 1,
        ProfileModifier = 2,
        ProfileBackground = 3,
        MiniProfileBackground = 4,
    }

    /// A property of a Community profile item (`ECommunityProfileItemProperty`). The `AppId`, `TypeId` and `Class`
    /// properties are numbers; read them with `getProfileItemPropertyUint`, the others with `getProfileItemPropertyString`.
    #[napi]
    pub enum ProfileItemProperty {
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
        MovieMp4Small = 11,
    }

    /// A friends group (tag) of the local user, with its members.
    #[napi(object)]
    pub struct FriendGroup {
        /// The group id, for `getFriendsGroupName` and `getFriendsGroupMembers`.
        pub id: i32,
        /// The group name, or an empty string when Steam returns none.
        pub name: String,
        /// The SteamID64s of the members, as far as the local Steam client knows them.
        pub members: Vec<BigInt>,
    }

    /// How active a clan was, as the local Steam client last knew it.
    #[napi(object)]
    pub struct ClanActivity {
        /// Members online.
        pub online: i32,
        /// Members in a game.
        pub in_game: i32,
        /// Members in the clan chat.
        pub chatting: i32,
    }

    /// A clan with the data that needs no request to Steam.
    #[napi(object)]
    pub struct ClanSummary {
        /// The clan's SteamID64.
        pub steam_id64: BigInt,
        /// The clan name, or `null` when Steam does not know it yet.
        #[napi(ts_type = "string | null")]
        pub name: Option<String>,
        /// The clan tag, or `null` when Steam does not know it yet.
        #[napi(ts_type = "string | null")]
        pub tag: Option<String>,
        /// The latest activity counts, or `null` when Steam has none (see `downloadClanActivityCounts`).
        #[napi(ts_type = "ClanActivity | null")]
        pub activity: Option<ClanActivity>,
    }

    /// A clan with its owner and officers, from `getClanInfo`.
    #[napi(object)]
    pub struct ClanInfo {
        /// The clan's SteamID64.
        pub steam_id64: BigInt,
        /// The clan name, or `null` when Steam does not know it.
        #[napi(ts_type = "string | null")]
        pub name: Option<String>,
        /// The clan tag, or `null` when Steam does not know it.
        #[napi(ts_type = "string | null")]
        pub tag: Option<String>,
        /// The latest activity counts, or `null` when Steam has none.
        #[napi(ts_type = "ClanActivity | null")]
        pub activity: Option<ClanActivity>,
        /// The SteamID64 of the clan owner, or `null` when it is not known.
        #[napi(ts_type = "bigint | null")]
        pub owner: Option<BigInt>,
        /// The SteamID64s of the officers, the owner included.
        pub officers: Vec<BigInt>,
    }

    /// A chat message from a clan chat room or a friend chat, from `getClanChatMessage` or `getFriendMessage`.
    #[napi(object)]
    pub struct ChatMessage {
        /// The SteamID64 of the sender. For a friend message this is the friend.
        pub chatter: BigInt,
        /// The kind of entry, such as a chat message or a join notice.
        pub entry_type: ChatEntryType,
        /// The text of the message. It is empty for entries that carry no text, and cut at the first NUL byte.
        pub text: String,
    }

    /// One page of the users the local user follows, from `enumerateFollowingList`.
    #[napi(object)]
    pub struct FollowingPage {
        /// The SteamID64s on this page, at most 50.
        pub steam_ids: Vec<BigInt>,
        /// The total number of users in the list, across all pages.
        pub total_count: i32,
    }

    /// The Community profile items a user has equipped, from `requestEquippedProfileItems`.
    #[napi(object)]
    pub struct EquippedProfileItems {
        /// The user has an animated avatar equipped.
        pub has_animated_avatar: bool,
        /// The user has an avatar frame equipped.
        pub has_avatar_frame: bool,
        /// The user has a profile modifier equipped.
        pub has_profile_modifier: bool,
        /// The user has a profile background equipped.
        pub has_profile_background: bool,
        /// The user has a mini profile background equipped.
        pub has_mini_profile_background: bool,
        /// `true` when Steam answered from its local cache instead of asking the server.
        pub from_cache: bool,
    }

    fn friends_api() -> steamworks::Friends {
        crate::client::get_client().friends()
    }

    fn friend_of(steam_id64: BigInt) -> Friend {
        let client = crate::client::get_client();
        client
            .friends()
            .get_friend(SteamId::from_raw(steam_id64.get_u64().1))
    }

    fn steam_id_of(steam_id64: BigInt) -> SteamId {
        SteamId::from_raw(steam_id64.get_u64().1)
    }

    fn big(steam_id: SteamId) -> BigInt {
        BigInt::from(steam_id.raw())
    }

    fn big_list(steam_ids: Vec<SteamId>) -> Vec<BigInt> {
        steam_ids.into_iter().map(big).collect()
    }

    /// Converts a JavaScript group id to a `FriendsGroupId`, or `None` when it does not fit the SDK's 16-bit id.
    fn group_of(group_id: i32) -> Option<FriendsGroupId> {
        i16::try_from(group_id).ok().map(FriendsGroupId::from_raw)
    }

    fn nul_error(name: &str) -> Error {
        Error::from_reason(format!("{name} must not contain a NUL character"))
    }

    fn js_friend_state(state: steamworks::FriendState) -> FriendState {
        match state {
            steamworks::FriendState::Offline => FriendState::Offline,
            steamworks::FriendState::Online => FriendState::Online,
            steamworks::FriendState::Invisible => FriendState::Invisible,
            steamworks::FriendState::Busy => FriendState::Busy,
            steamworks::FriendState::Away => FriendState::Away,
            steamworks::FriendState::Snooze => FriendState::Snooze,
            steamworks::FriendState::LookingToPlay => FriendState::LookingToPlay,
            steamworks::FriendState::LookingToTrade => FriendState::LookingToTrade,
        }
    }

    fn js_relationship(relationship: steamworks::FriendRelationship) -> FriendRelationship {
        match relationship {
            steamworks::FriendRelationship::None => FriendRelationship::None,
            steamworks::FriendRelationship::Blocked => FriendRelationship::Blocked,
            steamworks::FriendRelationship::RequestRecipient => {
                FriendRelationship::RequestRecipient
            }
            steamworks::FriendRelationship::Friend => FriendRelationship::Friend,
            steamworks::FriendRelationship::RequestInitiator => {
                FriendRelationship::RequestInitiator
            }
            steamworks::FriendRelationship::Ignored => FriendRelationship::Ignored,
            steamworks::FriendRelationship::IgnoredFriend => FriendRelationship::IgnoredFriend,
        }
    }

    fn js_chat_entry(entry_type: steamworks::ChatEntryType) -> ChatEntryType {
        match entry_type {
            steamworks::ChatEntryType::Invalid => ChatEntryType::Invalid,
            steamworks::ChatEntryType::ChatMsg => ChatEntryType::ChatMsg,
            steamworks::ChatEntryType::Typing => ChatEntryType::Typing,
            steamworks::ChatEntryType::InviteGame => ChatEntryType::InviteGame,
            steamworks::ChatEntryType::Emote => ChatEntryType::Emote,
            steamworks::ChatEntryType::LeftConversation => ChatEntryType::LeftConversation,
            steamworks::ChatEntryType::Entered => ChatEntryType::Entered,
            steamworks::ChatEntryType::WasKicked => ChatEntryType::WasKicked,
            steamworks::ChatEntryType::WasBanned => ChatEntryType::WasBanned,
            steamworks::ChatEntryType::Disconnected => ChatEntryType::Disconnected,
            steamworks::ChatEntryType::HistoricalChat => ChatEntryType::HistoricalChat,
            steamworks::ChatEntryType::LinkBlocked => ChatEntryType::LinkBlocked,
        }
    }

    fn js_chat_room(response: steamworks::ChatRoomEnterResponse) -> ChatRoomEnterResponse {
        match response {
            steamworks::ChatRoomEnterResponse::Success => ChatRoomEnterResponse::Success,
            steamworks::ChatRoomEnterResponse::DoesntExist => ChatRoomEnterResponse::DoesntExist,
            steamworks::ChatRoomEnterResponse::NotAllowed => ChatRoomEnterResponse::NotAllowed,
            steamworks::ChatRoomEnterResponse::Full => ChatRoomEnterResponse::Full,
            steamworks::ChatRoomEnterResponse::Error => ChatRoomEnterResponse::Error,
            steamworks::ChatRoomEnterResponse::Banned => ChatRoomEnterResponse::Banned,
            steamworks::ChatRoomEnterResponse::Limited => ChatRoomEnterResponse::Limited,
            steamworks::ChatRoomEnterResponse::ClanDisabled => ChatRoomEnterResponse::ClanDisabled,
            steamworks::ChatRoomEnterResponse::CommunityBan => ChatRoomEnterResponse::CommunityBan,
            steamworks::ChatRoomEnterResponse::MemberBlockedYou => {
                ChatRoomEnterResponse::MemberBlockedYou
            }
            steamworks::ChatRoomEnterResponse::YouBlockedMember => {
                ChatRoomEnterResponse::YouBlockedMember
            }
            steamworks::ChatRoomEnterResponse::RatelimitExceeded => {
                ChatRoomEnterResponse::RatelimitExceeded
            }
        }
    }

    fn steam_profile_type(item_type: ProfileItemType) -> steamworks::ProfileItemType {
        match item_type {
            ProfileItemType::AnimatedAvatar => steamworks::ProfileItemType::AnimatedAvatar,
            ProfileItemType::AvatarFrame => steamworks::ProfileItemType::AvatarFrame,
            ProfileItemType::ProfileModifier => steamworks::ProfileItemType::ProfileModifier,
            ProfileItemType::ProfileBackground => steamworks::ProfileItemType::ProfileBackground,
            ProfileItemType::MiniProfileBackground => {
                steamworks::ProfileItemType::MiniProfileBackground
            }
        }
    }

    fn steam_profile_property(property: ProfileItemProperty) -> steamworks::ProfileItemProperty {
        match property {
            ProfileItemProperty::ImageSmall => steamworks::ProfileItemProperty::ImageSmall,
            ProfileItemProperty::ImageLarge => steamworks::ProfileItemProperty::ImageLarge,
            ProfileItemProperty::InternalName => steamworks::ProfileItemProperty::InternalName,
            ProfileItemProperty::Title => steamworks::ProfileItemProperty::Title,
            ProfileItemProperty::Description => steamworks::ProfileItemProperty::Description,
            ProfileItemProperty::AppId => steamworks::ProfileItemProperty::AppId,
            ProfileItemProperty::TypeId => steamworks::ProfileItemProperty::TypeId,
            ProfileItemProperty::Class => steamworks::ProfileItemProperty::Class,
            ProfileItemProperty::MovieWebM => steamworks::ProfileItemProperty::MovieWebM,
            ProfileItemProperty::MovieMp4 => steamworks::ProfileItemProperty::MovieMp4,
            ProfileItemProperty::MovieWebMSmall => steamworks::ProfileItemProperty::MovieWebMSmall,
            ProfileItemProperty::MovieMp4Small => steamworks::ProfileItemProperty::MovieMp4Small,
        }
    }

    fn js_clan_activity(counts: steamworks::ClanActivityCounts) -> ClanActivity {
        ClanActivity {
            online: counts.online,
            in_game: counts.in_game,
            chatting: counts.chatting,
        }
    }

    fn js_chat_message(message: steamworks::ChatMessage) -> ChatMessage {
        ChatMessage {
            chatter: big(message.chatter),
            entry_type: js_chat_entry(message.entry_type),
            text: message.text,
        }
    }

    fn get_friends_impl(flags: u32) -> Vec<FriendInfo> {
        let client = crate::client::get_client();
        client
            .friends()
            .get_friends(FriendFlags::from_bits_truncate(flags as u16))
            .into_iter()
            .map(to_info)
            .collect()
    }

    fn to_info(friend: Friend) -> FriendInfo {
        FriendInfo {
            steam_id64: BigInt::from(friend.id().raw()),
            name: friend.name(),
            nick_name: friend.nick_name(),
        }
    }

    /// @param flags - Steam friend relationship flags (`FriendFlags` bits), e.g. `0x4` for immediate friends
    #[napi]
    pub fn get_friends(flags: u32) -> Vec<FriendInfo> {
        get_friends_impl(flags)
    }

    /// Players the local user has recently played with.
    #[napi]
    pub fn get_coplay_friends() -> Vec<FriendInfo> {
        let client = crate::client::get_client();
        client
            .friends()
            .get_coplay_friends()
            .into_iter()
            .map(to_info)
            .collect()
    }

    /// Returns the online state of a friend as the local Steam client knows it.
    /// Requires a running Steam client.
    /// @param steamId64 - SteamID64 of the friend, as a BigInt
    /// @returns the friend's `FriendState`
    #[napi]
    pub fn get_friend_state(steam_id64: BigInt) -> FriendState {
        js_friend_state(friend_of(steam_id64).state())
    }

    /// @param steamId64 - SteamID64 of the friend, as a BigInt
    /// @returns the AppID of the game the friend is playing, or `null` when they are not in a game
    #[napi]
    pub fn get_friend_game_played(steam_id64: BigInt) -> Option<u32> {
        friend_of(steam_id64)
            .game_played()
            .map(|game| game.game.app_id().0)
    }

    /// Returns the most recent co-play record between the local user and a friend.
    /// @param steamId64 - SteamID64 of the friend, as a BigInt
    /// @returns `appId` of the game played together (`0` when there is none) and `time`, the seconds since they last played together
    #[napi]
    pub fn get_friend_coplay_info(steam_id64: BigInt) -> CoplayInfo {
        let friend = friend_of(steam_id64);
        CoplayInfo {
            app_id: friend.coplay_game_played().0,
            time: friend.coplay_time(),
        }
    }

    /// @param steamId64 - SteamID64 of the friend, as a BigInt
    /// @returns the small (32x32) avatar as RGBA pixels, or `null` when it has not been loaded
    #[napi]
    pub fn get_small_avatar(steam_id64: BigInt) -> Option<Buffer> {
        friend_of(steam_id64).small_avatar().map(Buffer::from)
    }

    /// @param steamId64 - SteamID64 of the friend, as a BigInt
    /// @returns the medium (64x64) avatar as RGBA pixels, or `null` when it has not been loaded
    #[napi]
    pub fn get_medium_avatar(steam_id64: BigInt) -> Option<Buffer> {
        friend_of(steam_id64).medium_avatar().map(Buffer::from)
    }

    /// @param steamId64 - SteamID64 of the friend, as a BigInt
    /// @returns the large (184x184) avatar as RGBA pixels, or `null` when it has not been loaded
    #[napi]
    pub fn get_large_avatar(steam_id64: BigInt) -> Option<Buffer> {
        friend_of(steam_id64).large_avatar().map(Buffer::from)
    }

    /// Asks Steam for a user's name and, unless `nameOnly` is set, avatar. Returns at once; the answer arrives later as a `PersonaStateChange` callback while `runCallbacks()` runs.
    /// @param steamId64 - SteamID64 of the user, as a BigInt
    /// @param nameOnly - `true` to skip the avatar download, which is slower and fills the local cache
    /// @returns true when Steam will fetch the user information asynchronously (PersonaStateChange follows), false when the data is already known
    #[napi]
    pub fn request_user_information(steam_id64: BigInt, name_only: bool) -> bool {
        let client = crate::client::get_client();
        client
            .friends()
            .request_user_information(SteamId::from_raw(steam_id64.get_u64().1), name_only)
    }

    /// Clears all of the local user's Rich Presence keys (see `localplayer.setRichPresence`).
    #[napi]
    pub fn clear_rich_presence() {
        let client = crate::client::get_client();
        client.friends().clear_rich_presence();
    }

    /// Sends a game invite that carries `connectString` to the friend. The friend sees the invite in Steam; accepting it starts the game with that connect string. This sends data to another user.
    /// Throws when `connectString` contains a NUL character.
    /// @param steamId64 - SteamID64 of the friend to invite, as a BigInt
    /// @param connectString - The connect string the game receives when the invite is accepted
    #[napi]
    pub fn invite_user_to_game(steam_id64: BigInt, connect_string: String) -> Result<(), Error> {
        if connect_string.contains('\0') {
            return Err(Error::from_reason(
                "connectString must not contain a NUL character",
            ));
        }
        friend_of(steam_id64).invite_user_to_game(&connect_string);
        Ok(())
    }

    /// Marks the user as played with. The local user must currently be in game with them.
    /// @param steamId64 - SteamID64 of the user, as a BigInt
    #[napi]
    pub fn set_played_with(steam_id64: BigInt) {
        friend_of(steam_id64).set_played_with();
    }

    /// Returns the local user's own persona state (online, away, invisible, ...), as the local Steam client reports it.
    /// Requires a running Steam client.
    /// @returns the local user's `FriendState`
    #[napi]
    pub fn get_persona_state() -> FriendState {
        js_friend_state(friends_api().persona_state())
    }

    /// Returns the relationship between the local user and a user (friend, blocked, pending request, ...).
    /// @param steamId64 - SteamID64 of the user, as a BigInt
    /// @returns the `FriendRelationship`, or `null` for the deprecated suggested value or a value this binding does not name
    #[napi]
    pub fn get_friend_relationship(steam_id64: BigInt) -> Option<FriendRelationship> {
        friend_of(steam_id64).relationship().map(js_relationship)
    }

    /// Returns an earlier display name of a user. Index `0` is the name before the current one.
    /// @param steamId64 - SteamID64 of the user, as a BigInt
    /// @param index - Position in the name history, counting back from the current name
    /// @returns the old name, or `null` when there is no name at that index (the end of the history)
    #[napi]
    pub fn get_friend_persona_name_history(steam_id64: BigInt, index: i32) -> Option<String> {
        friend_of(steam_id64).persona_name_history(index)
    }

    /// Returns the Steam level of a user. It can be `0` until the local Steam client has the data (unverified against a live Steam client).
    /// @param steamId64 - SteamID64 of the user, as a BigInt
    /// @returns the Steam level
    #[napi]
    pub fn get_friend_steam_level(steam_id64: BigInt) -> i32 {
        friend_of(steam_id64).steam_level()
    }

    /// Returns the number of friends groups the local user has.
    /// @returns the number of groups; `getFriendsGroupId` takes an index from `0` to this count minus one
    #[napi]
    pub fn get_friends_group_count() -> i32 {
        friends_api().friends_group_count()
    }

    /// Returns the id of the friends group at an index.
    /// @param index - Index from `0` to `getFriendsGroupCount()` minus one
    /// @returns the group id, or `null` when the index is not a group
    #[napi]
    pub fn get_friends_group_id(index: i32) -> Option<i32> {
        friends_api()
            .friends_group_id(index)
            .map(|id| i32::from(id.raw()))
    }

    /// Returns the name of a friends group.
    /// @param groupId - Group id from `getFriendsGroupId`
    /// @returns the name, or `null` when the id is not a group or the name is empty
    #[napi]
    pub fn get_friends_group_name(group_id: i32) -> Option<String> {
        friends_api().friends_group_name(group_of(group_id)?)
    }

    /// Returns the number of members of a friends group.
    /// @param groupId - Group id from `getFriendsGroupId`
    /// @returns the number of members; `0` when the id is not a group
    #[napi]
    pub fn get_friends_group_members_count(group_id: i32) -> i32 {
        match group_of(group_id) {
            Some(group) => friends_api().friends_group_members_count(group),
            None => 0,
        }
    }

    /// Returns the members of a friends group.
    /// @param groupId - Group id from `getFriendsGroupId`
    /// @returns the SteamID64s of the members; empty when the id is not a group. Slots Steam leaves empty are skipped.
    #[napi]
    pub fn get_friends_group_members(group_id: i32) -> Vec<BigInt> {
        match group_of(group_id) {
            Some(group) => big_list(friends_api().friends_group_members(group)),
            None => Vec::new(),
        }
    }

    /// Returns every friends group with its name and members, in index order.
    /// @returns one `FriendGroup` per group, with `id`, `name` and `members` (SteamID64s as BigInt)
    #[napi]
    pub fn get_friend_groups() -> Vec<FriendGroup> {
        friends_api()
            .friends_groups()
            .into_iter()
            .map(|group| FriendGroup {
                id: i32::from(group.id.raw()),
                name: group.name,
                members: big_list(group.members),
            })
            .collect()
    }

    /// Returns the number of clans (groups) the local user is a member of.
    /// @returns the number of clans; `getClanByIndex` takes an index from `0` to this count minus one
    #[napi]
    pub fn get_clan_count() -> i32 {
        friends_api().clan_count()
    }

    /// Returns the SteamID64 of the clan at an index.
    /// @param index - Index from `0` to `getClanCount()` minus one
    /// @returns the clan's SteamID64 as a BigInt, or `null` when the SDK returns an invalid id
    #[napi]
    pub fn get_clan_by_index(index: i32) -> Option<BigInt> {
        friends_api().clan_by_index(index).map(big)
    }

    /// Returns the name of a clan. The local Steam client may not know it yet.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns the name, or `null` when Steam does not know it or the name is empty
    #[napi]
    pub fn get_clan_name(steam_id64: BigInt) -> Option<String> {
        friends_api().clan_name(steam_id_of(steam_id64))
    }

    /// Returns the tag of a clan. The local Steam client may not know it yet.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns the tag, or `null` when Steam does not know it or the tag is empty
    #[napi]
    pub fn get_clan_tag(steam_id64: BigInt) -> Option<String> {
        friends_api().clan_tag(steam_id_of(steam_id64))
    }

    /// Returns the latest activity counts Steam knows for a clan. A clan the user is not a member of has counts only after `downloadClanActivityCounts`.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns the counts (`online`, `inGame`, `chatting`), or `null` when Steam has none
    #[napi]
    pub fn get_clan_activity_counts(steam_id64: BigInt) -> Option<ClanActivity> {
        friends_api()
            .clan_activity_counts(steam_id_of(steam_id64))
            .map(js_clan_activity)
    }

    /// Returns every clan of the local user with its name, tag and activity counts. This makes no request to Steam, so
    /// the owner and officers are not included; use `getClanInfo` for them.
    /// @returns one `ClanSummary` per clan
    #[napi]
    pub fn get_clans() -> Vec<ClanSummary> {
        let friends = friends_api();
        (0..friends.clan_count())
            .filter_map(|index| friends.clan_by_index(index))
            .map(|clan| ClanSummary {
                steam_id64: big(clan),
                name: friends.clan_name(clan),
                tag: friends.clan_tag(clan),
                activity: friends.clan_activity_counts(clan).map(js_clan_activity),
            })
            .collect()
    }

    /// Returns the owner of a clan. It is known only after `requestClanOfficerList` (or `getClanInfo`) has completed.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns the owner's SteamID64, or `null` when it is not known
    #[napi]
    pub fn get_clan_owner(steam_id64: BigInt) -> Option<BigInt> {
        friends_api().clan_owner(steam_id_of(steam_id64)).map(big)
    }

    /// Returns the number of officers of a clan, the owner included. Known only after `requestClanOfficerList` has completed.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns the number of officers
    #[napi]
    pub fn get_clan_officer_count(steam_id64: BigInt) -> i32 {
        friends_api().clan_officer_count(steam_id_of(steam_id64))
    }

    /// Returns an officer of a clan. Known only after `requestClanOfficerList` has completed.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @param index - Index from `0` to `getClanOfficerCount()` minus one
    /// @returns the officer's SteamID64, or `null` for an invalid id
    #[napi]
    pub fn get_clan_officer_by_index(steam_id64: BigInt, index: i32) -> Option<BigInt> {
        friends_api()
            .clan_officer_by_index(steam_id_of(steam_id64), index)
            .map(big)
    }

    /// Returns whether a clan is public. Unknown clans may be reported as not public (unverified against a live Steam client).
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns true if the clan is public
    #[napi]
    pub fn is_clan_public(steam_id64: BigInt) -> bool {
        friends_api().is_clan_public(steam_id_of(steam_id64))
    }

    /// Returns whether a clan is the official game group of an app (unverified against a live Steam client).
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns true if the clan is an official game group
    #[napi]
    pub fn is_clan_official_game_group(steam_id64: BigInt) -> bool {
        friends_api().is_clan_official_game_group(steam_id_of(steam_id64))
    }

    /// Returns how many users the local user can see in a source (a clan, lobby, chat room or game server).
    /// @param sourceId64 - The source's SteamID64, as a BigInt
    /// @returns the number of users the local Steam client knows in that source
    #[napi]
    pub fn get_friend_count_from_source(source_id64: BigInt) -> i32 {
        friends_api().friend_count_from_source(steam_id_of(source_id64))
    }

    /// Returns a user at an index in a source (see `getFriendCountFromSource`).
    /// @param sourceId64 - The source's SteamID64, as a BigInt
    /// @param index - Index from `0` to `getFriendCountFromSource(sourceId64)` minus one
    /// @returns the user's SteamID64, or `null` for an invalid id
    #[napi]
    pub fn get_friend_from_source_by_index(source_id64: BigInt, index: i32) -> Option<BigInt> {
        friends_api()
            .friend_from_source_by_index(steam_id_of(source_id64), index)
            .map(big)
    }

    /// Returns whether the local user can see that a user is a member of, or in, a source.
    /// @param userId64 - The user's SteamID64, as a BigInt
    /// @param sourceId64 - The source's SteamID64, as a BigInt
    /// @returns true if the user is in the source as far as the local Steam client knows
    #[napi]
    pub fn is_user_in_source(user_id64: BigInt, source_id64: BigInt) -> bool {
        friends_api().is_user_in_source(steam_id_of(user_id64), steam_id_of(source_id64))
    }

    /// Tells Steam that a user is pressing the talk button in the current game, which mutes the microphone of Steam friends voice chat for that user. Affects only the Steam client's friends UI (unverified against a live Steam client).
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @param speaking - `true` while the talk button is pressed
    #[napi]
    pub fn set_in_game_voice_speaking(steam_id64: BigInt, speaking: bool) {
        friends_api().set_in_game_voice_speaking(steam_id_of(steam_id64), speaking);
    }

    /// Returns how many chats (friends or chat rooms) have unread messages that would show a notification. Watch the `UnreadChatMessagesChanged` callback to see when it changes.
    /// @returns the number of chats with unread priority messages
    #[napi]
    pub fn get_num_chats_with_unread_priority_messages() -> i32 {
        friends_api().num_chats_with_unread_priority_messages()
    }

    /// Opens the overlay's Remote Play Together invite dialog for a lobby. The user sends the invitations in the dialog. Requires the Steam overlay.
    /// @param lobbyId - The lobby's id, as a BigInt
    #[napi]
    pub fn activate_remote_play_together_invite_dialog(lobby_id: BigInt) {
        friends_api()
            .activate_remote_play_together_invite_dialog(LobbyId::from_raw(lobby_id.get_u64().1));
    }

    /// Makes the overlay browser report navigations to a protocol instead of opening them. Steam then posts the `OverlayBrowserProtocolNavigation` callback.
    /// Throws when `protocol` contains a NUL character.
    /// @param protocol - The protocol name, for example `myapp`
    /// @returns true when Steam accepted the protocol
    #[napi]
    pub fn register_protocol_in_overlay_browser(protocol: String) -> Result<bool, Error> {
        friends_api()
            .register_protocol_in_overlay_browser(&protocol)
            .map_err(|_| nul_error("protocol"))
    }

    /// Joins a clan chat room from inside the game. Resolves once Steam has answered; the request is driven by `runCallbacks()`.
    /// Rejects when no answer arrives. Check the result: only `ChatRoomEnterResponse.Success` means the game is in the room.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns the room's `ChatRoomEnterResponse`
    #[napi]
    pub async fn join_clan_chat_room(steam_id64: BigInt) -> Result<ChatRoomEnterResponse, Error> {
        let (tx, rx) = oneshot::channel();
        friends_api().join_clan_chat_room(steam_id_of(steam_id64), |result| {
            let _ = tx.send(result);
        });
        let response = await_completion(rx, "joining the clan chat room").await?;
        Ok(js_chat_room(response))
    }

    /// Leaves a clan chat room the game has joined.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns true if Steam accepted the request, otherwise false (for example when the room is not joined)
    #[napi]
    pub fn leave_clan_chat_room(steam_id64: BigInt) -> bool {
        friends_api().leave_clan_chat_room(steam_id_of(steam_id64))
    }

    /// Returns the number of members in a clan chat room the game has joined.
    /// @param clanChatId64 - The chat room's SteamID64, as a BigInt
    /// @returns the number of members
    #[napi]
    pub fn get_clan_chat_member_count(clan_chat_id64: BigInt) -> i32 {
        friends_api().clan_chat_member_count(steam_id_of(clan_chat_id64))
    }

    /// Returns a member of a clan chat room the game has joined.
    /// @param clanChatId64 - The chat room's SteamID64, as a BigInt
    /// @param index - Index from `0` to `getClanChatMemberCount` minus one
    /// @returns the member's SteamID64, or `null` for an invalid id
    #[napi]
    pub fn get_clan_chat_member_by_index(clan_chat_id64: BigInt, index: i32) -> Option<BigInt> {
        friends_api()
            .clan_chat_member_by_index(steam_id_of(clan_chat_id64), index)
            .map(big)
    }

    /// Sends a message to a clan chat room the game has joined. The message is posted for every member of the room.
    /// Throws when `text` contains a NUL character.
    /// @param clanChatId64 - The chat room's SteamID64, as a BigInt
    /// @param text - The message text
    /// @returns true if Steam accepted the message
    #[napi]
    pub fn send_clan_chat_message(clan_chat_id64: BigInt, text: String) -> Result<bool, Error> {
        friends_api()
            .send_clan_chat_message(steam_id_of(clan_chat_id64), &text)
            .map_err(|_| nul_error("text"))
    }

    /// Reads a message from a clan chat room the game has joined. Messages longer than 8192 bytes are cut.
    /// @param clanChatId64 - The chat room's SteamID64, as a BigInt
    /// @param index - The message index, from the `GameConnectedClanChatMsg` callback's `messageId`
    /// @returns the `ChatMessage`, or `null` when Steam returns a negative length (whether an out-of-range index gives `null` is unverified against a live Steam client)
    #[napi]
    pub fn get_clan_chat_message(clan_chat_id64: BigInt, index: i32) -> Option<ChatMessage> {
        friends_api()
            .clan_chat_message(steam_id_of(clan_chat_id64), index)
            .map(js_chat_message)
    }

    /// Returns whether a user is an admin of a clan chat room.
    /// @param clanChatId64 - The chat room's SteamID64, as a BigInt
    /// @param userId64 - The user's SteamID64, as a BigInt
    /// @returns true if the user is an admin
    #[napi]
    pub fn is_clan_chat_admin(clan_chat_id64: BigInt, user_id64: BigInt) -> bool {
        friends_api().is_clan_chat_admin(steam_id_of(clan_chat_id64), steam_id_of(user_id64))
    }

    /// Returns whether the clan chat window is open in the Steam client, outside the game.
    /// @param clanChatId64 - The chat room's SteamID64, as a BigInt
    /// @returns true if the window is open
    #[napi]
    pub fn is_clan_chat_window_open_in_steam(clan_chat_id64: BigInt) -> bool {
        friends_api().is_clan_chat_window_open_in_steam(steam_id_of(clan_chat_id64))
    }

    /// Opens the clan chat window in the Steam client, outside the game. This changes what the user sees.
    /// @param clanChatId64 - The chat room's SteamID64, as a BigInt
    /// @returns true if Steam opened it
    #[napi]
    pub fn open_clan_chat_window_in_steam(clan_chat_id64: BigInt) -> bool {
        friends_api().open_clan_chat_window_in_steam(steam_id_of(clan_chat_id64))
    }

    /// Closes the clan chat window in the Steam client. This changes what the user sees.
    /// @param clanChatId64 - The chat room's SteamID64, as a BigInt
    /// @returns true if Steam closed it
    #[napi]
    pub fn close_clan_chat_window_in_steam(clan_chat_id64: BigInt) -> bool {
        friends_api().close_clan_chat_window_in_steam(steam_id_of(clan_chat_id64))
    }

    /// Turns on or off the interception of friend-to-friend chat messages. While it is on, the game gets them through the `GameConnectedFriendChatMsg` callback and reads them with `getFriendMessage`, and the Steam client does not show them.
    /// @param enabled - `true` to intercept, `false` to restore the Steam client's own handling
    /// @returns true if Steam accepted the change
    #[napi]
    pub fn set_listen_for_friends_messages(enabled: bool) -> bool {
        friends_api().set_listen_for_friends_messages(enabled)
    }

    /// Sends a chat message to a friend. The message is delivered to the friend.
    /// Throws when `text` contains a NUL character.
    /// @param steamId64 - The friend's SteamID64, as a BigInt
    /// @param text - The message text
    /// @returns true if Steam accepted the message
    #[napi]
    pub fn reply_to_friend_message(steam_id64: BigInt, text: String) -> Result<bool, Error> {
        friends_api()
            .reply_to_friend_message(steam_id_of(steam_id64), &text)
            .map_err(|_| nul_error("text"))
    }

    /// Reads a friend chat message. Use it after the `GameConnectedFriendChatMsg` callback, with that callback's `messageId`. Messages longer than 8192 bytes are cut.
    /// @param steamId64 - The friend's SteamID64, as a BigInt
    /// @param index - The message id from the `GameConnectedFriendChatMsg` callback
    /// @returns the `ChatMessage` (its `chatter` is the friend), or `null` when Steam returns a negative length (unverified against a live Steam client)
    #[napi]
    pub fn get_friend_message(steam_id64: BigInt, index: i32) -> Option<ChatMessage> {
        friends_api()
            .friend_message(steam_id_of(steam_id64), index)
            .map(js_chat_message)
    }

    /// Asks Steam how many users follow a user. Resolves with the count; the request is driven by `runCallbacks()`.
    /// Rejects when no answer arrives or Steam reports an error.
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @returns the number of followers
    #[napi]
    pub async fn get_follower_count(steam_id64: BigInt) -> Result<i32, Error> {
        let (tx, rx) = oneshot::channel();
        friends_api().follower_count(steam_id_of(steam_id64), |result| {
            let _ = tx.send(result);
        });
        await_completion(rx, "reading the follower count").await
    }

    /// Asks Steam whether the local user follows a user. Resolves with the answer; the request is driven by `runCallbacks()`.
    /// Rejects when no answer arrives or Steam reports an error.
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @returns true if the local user follows the user
    #[napi]
    pub async fn is_following(steam_id64: BigInt) -> Result<bool, Error> {
        let (tx, rx) = oneshot::channel();
        friends_api().is_following(steam_id_of(steam_id64), |result| {
            let _ = tx.send(result);
        });
        await_completion(rx, "checking whether the user is followed").await
    }

    /// Asks Steam for one page of the users the local user follows. Resolves with the page; the request is driven by `runCallbacks()`.
    /// Rejects when no answer arrives or Steam reports an error.
    /// @param startIndex - Index of the first user on the page, from `0`
    /// @returns the page: `steamIds` (at most 50 SteamID64s) and `totalCount`, the size of the whole list
    #[napi]
    pub async fn enumerate_following_list(start_index: u32) -> Result<FollowingPage, Error> {
        let (tx, rx) = oneshot::channel();
        friends_api().enumerate_following_list(start_index, |result| {
            let _ = tx.send(result);
        });
        let page = await_completion(rx, "reading the following list").await?;
        Ok(FollowingPage {
            steam_ids: big_list(page.steam_ids),
            total_count: page.total_count,
        })
    }

    /// Asks Steam which Community profile items a user has equipped. Resolves once Steam has answered; the request is driven by `runCallbacks()`. Read the items with `hasEquippedProfileItem` and the property functions after it resolves.
    /// Rejects when no answer arrives or Steam reports an error.
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @returns the equipped flags and `fromCache`
    #[napi]
    pub async fn request_equipped_profile_items(
        steam_id64: BigInt,
    ) -> Result<EquippedProfileItems, Error> {
        let (tx, rx) = oneshot::channel();
        friends_api().request_equipped_profile_items(steam_id_of(steam_id64), |result| {
            let _ = tx.send(result);
        });
        let items = await_completion(rx, "reading the equipped profile items").await?;
        Ok(EquippedProfileItems {
            has_animated_avatar: items.has_animated_avatar,
            has_avatar_frame: items.has_avatar_frame,
            has_profile_modifier: items.has_profile_modifier,
            has_profile_background: items.has_profile_background,
            has_mini_profile_background: items.has_mini_profile_background,
            from_cache: items.from_cache,
        })
    }

    /// Returns whether a user has equipped a profile item of that kind. Valid only after `requestEquippedProfileItems` has resolved for that user.
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @param itemType - The kind of profile item (`ProfileItemType`)
    /// @returns true if the user has one equipped
    #[napi]
    pub fn has_equipped_profile_item(steam_id64: BigInt, item_type: ProfileItemType) -> bool {
        friends_api()
            .has_equipped_profile_item(steam_id_of(steam_id64), steam_profile_type(item_type))
    }

    /// Returns a text property of an equipped profile item. Valid only after `requestEquippedProfileItems` has resolved for that user.
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @param itemType - The kind of profile item (`ProfileItemType`)
    /// @param property - The property to read (`ProfileItemProperty`)
    /// @returns the value, or `null` when Steam has none
    #[napi]
    pub fn get_profile_item_property_string(
        steam_id64: BigInt,
        item_type: ProfileItemType,
        property: ProfileItemProperty,
    ) -> Option<String> {
        friends_api().profile_item_property_string(
            steam_id_of(steam_id64),
            steam_profile_type(item_type),
            steam_profile_property(property),
        )
    }

    /// Returns a number property of an equipped profile item (`AppId`, `TypeId` or `Class`). Valid only after `requestEquippedProfileItems` has resolved for that user.
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @param itemType - The kind of profile item (`ProfileItemType`)
    /// @param property - The property to read (`ProfileItemProperty`)
    /// @returns the value, or `0` when Steam has none
    #[napi]
    pub fn get_profile_item_property_uint(
        steam_id64: BigInt,
        item_type: ProfileItemType,
        property: ProfileItemProperty,
    ) -> u32 {
        friends_api().profile_item_property_uint(
            steam_id_of(steam_id64),
            steam_profile_type(item_type),
            steam_profile_property(property),
        )
    }

    /// Asks Steam for a user's Rich Presence. Steam posts the `FriendRichPresenceUpdate` callback when the data arrives; read it with `getFriendRichPresence` after that.
    /// @param steamId64 - The user's SteamID64, as a BigInt
    #[napi]
    pub fn request_friend_rich_presence(steam_id64: BigInt) {
        friend_of(steam_id64).request_rich_presence();
    }

    /// Returns the Rich Presence value a user has set for a key (for example `status`).
    /// Throws when `key` contains a NUL character.
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @param key - The Rich Presence key
    /// @returns the value, or `null` when the user has not set the key
    #[napi]
    pub fn get_friend_rich_presence(
        steam_id64: BigInt,
        key: String,
    ) -> Result<Option<String>, Error> {
        friend_of(steam_id64)
            .rich_presence(&key)
            .map_err(|_| nul_error("key"))
    }

    /// Returns how many Rich Presence keys a user currently has, for listing them with `getFriendRichPresenceKey`.
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @returns the number of keys
    #[napi]
    pub fn get_friend_rich_presence_key_count(steam_id64: BigInt) -> i32 {
        friend_of(steam_id64).rich_presence_key_count()
    }

    /// Returns a Rich Presence key of a user by its index (typically used for debugging).
    /// @param steamId64 - The user's SteamID64, as a BigInt
    /// @param index - Index from `0` to `getFriendRichPresenceKeyCount` minus one
    /// @returns the key name, or `null` when there is none at that index
    #[napi]
    pub fn get_friend_rich_presence_key(steam_id64: BigInt, index: i32) -> Option<String> {
        friend_of(steam_id64).rich_presence_key(index)
    }

    /// Downloads activity counts for clans the local user is not a member of. Resolves when Steam has answered; the request is driven by `runCallbacks()`. Afterwards `getClanActivityCounts` and `getClans` return the counts.
    /// Rejects when no answer arrives or Steam reports failure.
    /// @param clanIds - The clans' SteamID64s, as BigInts
    #[napi]
    pub async fn download_clan_activity_counts(clan_ids: Vec<BigInt>) -> Result<(), Error> {
        let clans: Vec<SteamId> = clan_ids.into_iter().map(steam_id_of).collect();
        let (tx, rx) = oneshot::channel();
        friends_api().download_clan_activity_counts(&clans, |result| {
            let _ = tx.send(result);
        });
        await_completion(rx, "downloading the clan activity counts").await
    }

    /// Asks Steam for a clan's officer list, which gives the owner and the officers. Only a member of the clan can ask. Resolves with the number of officers, the owner included; the request is driven by `runCallbacks()`.
    /// Rejects when no answer arrives or Steam reports failure.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns the number of officers, the owner included
    #[napi]
    pub async fn request_clan_officer_list(steam_id64: BigInt) -> Result<i32, Error> {
        let (tx, rx) = oneshot::channel();
        friends_api().request_clan_officer_list(steam_id_of(steam_id64), |result| {
            let _ = tx.send(result);
        });
        await_completion(rx, "requesting the clan officer list").await
    }

    /// Returns a clan with its owner and officers. It asks Steam for the officer list first, so it resolves after the officer list has arrived; the request is driven by `runCallbacks()`.
    /// Rejects when no answer arrives or Steam reports failure. Use `getClans` to read many clans without this request.
    /// @param steamId64 - The clan's SteamID64, as a BigInt
    /// @returns the `ClanInfo` with name, tag, activity counts, owner and officers
    #[napi]
    pub async fn get_clan_info(steam_id64: BigInt) -> Result<ClanInfo, Error> {
        let clan = steam_id_of(steam_id64);
        let (tx, rx) = oneshot::channel();
        friends_api().request_clan_officer_list(clan, |result| {
            let _ = tx.send(result);
        });
        await_completion(rx, "requesting the clan officer list").await?;
        // Read the data after the await, so no SDK handle is held across it
        let friends = friends_api();
        let officer_count = friends.clan_officer_count(clan);
        Ok(ClanInfo {
            steam_id64: big(clan),
            name: friends.clan_name(clan),
            tag: friends.clan_tag(clan),
            activity: friends.clan_activity_counts(clan).map(js_clan_activity),
            owner: friends.clan_owner(clan).map(big),
            officers: (0..officer_count)
                .filter_map(|index| friends.clan_officer_by_index(clan, index))
                .map(big)
                .collect(),
        })
    }
}
