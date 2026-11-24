use napi_derive::napi;

#[napi]
pub mod stats {
    use crate::api::workshop::workshop::await_completion;
    use napi::bindgen_prelude::{BigInt, Error};
    use tokio::sync::oneshot;

    /// Reads a SteamID from a BigInt. Returns `None` for a negative value or one that does not fit in 64 bits.
    fn steam_id_from_bigint(value: &BigInt) -> Option<steamworks::SteamId> {
        let (signed, raw, lossless) = value.get_u64();
        (!signed && lossless).then(|| steamworks::SteamId::from_raw(raw))
    }

    /// The most days of history the SDK accepts for global stats (the limit in the SDK header).
    const MAX_HISTORY_DAYS: u32 = 60;

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

    /// Reads an integer stat of another user. Needs `requestUserStats(steamId64)` to have completed for that user first.
    /// @param steamId64 - the other user's 64-bit SteamID
    /// @param name - stat name as defined in the Steamworks site
    /// @returns the value, or `null` when the stat is missing, the user's stats are not loaded, or the SteamID is not a valid 64-bit value
    #[napi]
    pub fn get_user_int(steam_id64: BigInt, name: String) -> Option<i32> {
        let user = steam_id_from_bigint(&steam_id64)?;
        let client = crate::client::get_client();
        client.user_stats().get_user_stat_i32(user, &name).ok()
    }

    /// Reads a float stat of another user. Same requirements as `getUserInt()`.
    /// @param steamId64 - the other user's 64-bit SteamID
    /// @param name - stat name as defined in the Steamworks site
    /// @returns the value, or `null` when the stat is missing, the user's stats are not loaded, or the SteamID is not a valid 64-bit value
    #[napi]
    pub fn get_user_float(steam_id64: BigInt, name: String) -> Option<f64> {
        let user = steam_id_from_bigint(&steam_id64)?;
        let client = crate::client::get_client();
        client
            .user_stats()
            .get_user_stat_f32(user, &name)
            .ok()
            .map(f64::from)
    }

    /// Adds to an average-rate stat of the local user. The change is sent to Steam only after `store()`. Steam keeps the count as a 32-bit float, so very large counts lose precision.
    /// @param name - stat name as defined in the Steamworks site
    /// @param countThisSession - the amount accumulated in this session
    /// @param sessionLength - the length of the session, in seconds
    /// @returns `true` when Steam accepted the change, otherwise `false` (for example a name with a NUL character)
    #[napi]
    pub fn update_avg_rate_stat(
        name: String,
        count_this_session: f64,
        session_length: f64,
    ) -> bool {
        let client = crate::client::get_client();
        client
            .user_stats()
            .update_avg_rate_stat(&name, count_this_session as f32, session_length)
            .is_ok()
    }

    /// Asks Steam for the global stats of the game and the daily history of the last `historyDays` days. Resolves when Steam answers, which happens while `runCallbacks()` runs. Needs `init()`.
    /// @param historyDays - days of daily history to fetch, from `0` to `60`
    /// @returns the GameID Steam reports for the app; rejects when `historyDays` is above 60 or when Steam reports an error
    #[napi]
    pub async fn request_global_stats(history_days: u32) -> Result<BigInt, Error> {
        if history_days > MAX_HISTORY_DAYS {
            return Err(Error::from_reason("historyDays must be 60 or less"));
        }
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client
            .user_stats()
            .request_global_stats(history_days as i32, |result| {
                let _ = tx.send(result);
            });
        let game_id = await_completion(rx, "requesting the global stats").await?;
        Ok(BigInt::from(game_id.raw()))
    }

    /// Reads a global integer stat. Needs `requestGlobalStats()` to have completed.
    /// @param name - stat name as defined in the Steamworks site
    /// @returns the value as a BigInt, or `null` when the stat is not defined or the global stats are not loaded
    #[napi]
    pub fn get_global_int(name: String) -> Option<BigInt> {
        let client = crate::client::get_client();
        client
            .user_stats()
            .get_global_stat_i64(&name)
            .ok()
            .map(BigInt::from)
    }

    /// Reads a global float stat. Needs `requestGlobalStats()` to have completed.
    /// @param name - stat name as defined in the Steamworks site
    /// @returns the value, or `null` when the stat is not defined or the global stats are not loaded
    #[napi]
    pub fn get_global_float(name: String) -> Option<f64> {
        let client = crate::client::get_client();
        client.user_stats().get_global_stat_f64(&name).ok()
    }

    /// Reads the daily history of a global integer stat, newest day first. Needs `requestGlobalStats()` to have completed.
    /// @param name - stat name as defined in the Steamworks site
    /// @param days - number of days to read, from `0` to `60`, and at most the days asked for in `requestGlobalStats()`
    /// @returns the daily values as BigInts, or `null` when the stat is unknown, the global stats are not loaded, or `days` is above 60
    #[napi]
    pub fn get_global_int_history(name: String, days: u32) -> Option<Vec<BigInt>> {
        if days > MAX_HISTORY_DAYS {
            return None;
        }
        let client = crate::client::get_client();
        client
            .user_stats()
            .get_global_stat_history_i64(&name, days)
            .ok()
            .map(|values| values.into_iter().map(BigInt::from).collect())
    }

    /// Reads the daily history of a global float stat, newest day first. Same requirements as `getGlobalIntHistory()`.
    /// @param name - stat name as defined in the Steamworks site
    /// @param days - number of days to read, from `0` to `60`, and at most the days asked for in `requestGlobalStats()`
    /// @returns the daily values, or `null` when the stat is unknown, the global stats are not loaded, or `days` is above 60
    #[napi]
    pub fn get_global_float_history(name: String, days: u32) -> Option<Vec<f64>> {
        if days > MAX_HISTORY_DAYS {
            return None;
        }
        let client = crate::client::get_client();
        client
            .user_stats()
            .get_global_stat_history_f64(&name, days)
            .ok()
    }

    /// Asks Steam how many players are playing the game right now, online and offline. Resolves when Steam answers, which happens while `runCallbacks()` runs.
    /// @returns the player count; rejects when Steam reports a failure
    #[napi]
    pub async fn get_number_of_current_players() -> Result<i32, Error> {
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client.user_stats().get_number_of_current_players(|result| {
            let _ = tx.send(result);
        });
        await_completion(rx, "reading the number of current players").await
    }
}
