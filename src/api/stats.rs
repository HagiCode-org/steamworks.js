use napi_derive::napi;

#[napi]
pub mod stats {
    use napi::bindgen_prelude::BigInt;

    #[napi]
    pub fn get_int(name: String) -> Option<i32> {
        let client = crate::client::get_client();
        client.user_stats().get_stat_i32(&name).ok()
    }

    #[napi]
    pub fn set_int(name: String, value: i32) -> bool {
        let client = crate::client::get_client();
        client.user_stats().set_stat_i32(&name, value).is_ok()
    }

    #[napi]
    pub fn store() -> bool {
        let client = crate::client::get_client();
        client.user_stats().store_stats().is_ok()
    }

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
