use napi_derive::napi;

#[napi]
pub mod friends {
    use napi::bindgen_prelude::{BigInt, Buffer, Error};
    use steamworks::{Friend, FriendFlags, SteamId};

    #[napi(object)]
    pub struct FriendInfo {
        pub steam_id64: BigInt,
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

    fn friend_of(steam_id64: BigInt) -> Friend {
        let client = crate::client::get_client();
        client
            .friends()
            .get_friend(SteamId::from_raw(steam_id64.get_u64().1))
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
        let client = crate::client::get_client();
        client
            .friends()
            .get_friends(FriendFlags::from_bits_truncate(flags as u16))
            .into_iter()
            .map(to_info)
            .collect()
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

    #[napi]
    pub fn get_friend_state(steam_id64: BigInt) -> FriendState {
        match friend_of(steam_id64).state() {
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

    /// @returns the AppID of the game the friend is playing, or `null` when they are not in a game
    #[napi]
    pub fn get_friend_game_played(steam_id64: BigInt) -> Option<u32> {
        friend_of(steam_id64)
            .game_played()
            .map(|game| game.game.app_id().0)
    }

    #[napi]
    pub fn get_friend_coplay_info(steam_id64: BigInt) -> CoplayInfo {
        let friend = friend_of(steam_id64);
        CoplayInfo {
            app_id: friend.coplay_game_played().0,
            time: friend.coplay_time(),
        }
    }

    /// @returns the small (32x32) avatar as RGBA pixels, or `null` when it has not been loaded
    #[napi]
    pub fn get_small_avatar(steam_id64: BigInt) -> Option<Buffer> {
        friend_of(steam_id64).small_avatar().map(Buffer::from)
    }

    /// @returns the medium (64x64) avatar as RGBA pixels, or `null` when it has not been loaded
    #[napi]
    pub fn get_medium_avatar(steam_id64: BigInt) -> Option<Buffer> {
        friend_of(steam_id64).medium_avatar().map(Buffer::from)
    }

    /// @returns the large (184x184) avatar as RGBA pixels, or `null` when it has not been loaded
    #[napi]
    pub fn get_large_avatar(steam_id64: BigInt) -> Option<Buffer> {
        friend_of(steam_id64).large_avatar().map(Buffer::from)
    }

    /// @returns true when Steam will fetch the user information asynchronously (PersonaStateChange follows)
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

    /// Sends a game invite that carries `connectString` to the friend.
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
    #[napi]
    pub fn set_played_with(steam_id64: BigInt) {
        friend_of(steam_id64).set_played_with();
    }
}
