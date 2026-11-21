use napi_derive::napi;

#[napi]
pub mod stats {
    use napi::bindgen_prelude::BigInt;

    /// Reads an integer stat of the local user from the locally loaded stats. Unverified against a live Steam client: the stats must be loaded first.
    /// @param name - stat name as defined in the Steamworks site
    /// @returns the stat value, or `null` when the stat is missing or not loaded
    #[napi]
    pub fn get_int(name: String) -> Option<i32> {
        let client = crate::client::get_client();
        client.user_stats().get_stat_i32(&name).ok()
    }

    /// Sets an integer stat of the local user. The value is not sent to Steam until `store()` is called.
    /// @param name - stat name as defined in the Steamworks site
    /// @param value - 32-bit signed integer
    /// @returns `true` when Steam accepted the change, otherwise `false`
    #[napi]
    pub fn set_int(name: String, value: i32) -> bool {
        let client = crate::client::get_client();
        client.user_stats().set_stat_i32(&name, value).is_ok()
    }

    /// Sends the pending stat and achievement changes of the local user to Steam. The request is asynchronous, so `true` only means Steam accepted it.
    /// @returns `true` when Steam accepted the request, otherwise `false`
    #[napi]
    pub fn store() -> bool {
        let client = crate::client::get_client();
        client.user_stats().store_stats().is_ok()
    }

    /// Resets all stats of the local user. This cannot be undone from this binding.
    /// @param achievementsToo - `true` also clears the user's achievements
    /// @returns `true` when Steam accepted the reset, otherwise `false`
    #[napi]
    pub fn reset_all(achievements_too: bool) -> bool {
        let client = crate::client::get_client();
        client
            .user_stats()
            .reset_all_stats(achievements_too)
            .is_ok()
    }

    /// @returns the float stat value, or `null` when the stat is not defined
    #[napi]
    pub fn get_float(name: String) -> Option<f64> {
        if name.contains('\0') {
            return None;
        }
        let client = crate::client::get_client();
        client.user_stats().get_stat_f32(&name).ok().map(f64::from)
    }

    /// Sets a float stat. The value is stored as a 32-bit float. Returns `false` when Steam rejects it.
    #[napi]
    pub fn set_float(name: String, value: f64) -> bool {
        if name.contains('\0') {
            return false;
        }
        let client = crate::client::get_client();
        client
            .user_stats()
            .set_stat_f32(&name, value as f32)
            .is_ok()
    }

    /// @returns the number of achievements defined for the game, or `null` when statistics are not available
    #[napi]
    pub fn get_num_achievements() -> Option<u32> {
        let client = crate::client::get_client();
        client.user_stats().get_num_achievements().ok()
    }

    /// Asks Steam to fetch another user's statistics. The result arrives later through the `UserStatsReceived` callback.
    #[napi]
    pub fn request_user_stats(steam_id64: BigInt) {
        let client = crate::client::get_client();
        client
            .user_stats()
            .request_user_stats(steam_id64.get_u64().1);
    }
}
