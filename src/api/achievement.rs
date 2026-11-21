use napi_derive::napi;

#[napi]
pub mod achievement {
    use crate::api::workshop::workshop::await_completion;
    use napi::bindgen_prelude::Error;
    use tokio::sync::oneshot;

    /// Unlocks an achievement and stores the change to Steam. Needs `init()`, which requests the user's stats.
    /// Returns true when Steam accepted both the unlock and the store request. The store finishes asynchronously, and its result arrives through the UserStatsStored callback while `runCallbacks()` runs.
    /// @param achievement - The achievement API name as configured in Steamworks.
    /// @returns true if the request was accepted, otherwise false (for example an unknown name, or stats that Steam has not received yet).
    #[napi]
    pub fn activate(achievement: String) -> bool {
        let client = crate::client::get_client();
        client
            .user_stats()
            .achievement(&achievement)
            .set()
            .and_then(|_| client.user_stats().store_stats())
            .is_ok()
    }

    /// Checks whether the user has unlocked an achievement. Needs `init()`, which requests the user's stats.
    /// @param achievement - The achievement API name as configured in Steamworks.
    /// @returns true if unlocked, otherwise false. False is also returned when the lookup fails (unknown name, or stats not received yet), so a failed lookup cannot be told apart from a locked achievement.
    #[napi]
    pub fn is_activated(achievement: String) -> bool {
        let client = crate::client::get_client();
        client
            .user_stats()
            .achievement(&achievement)
            .get()
            .unwrap_or(false)
    }

    /// Re-locks an achievement and stores the change to Steam. Same requirements as `activate()`.
    /// @param achievement - The achievement API name as configured in Steamworks.
    /// @returns true if Steam accepted both the clear and the store request, otherwise false.
    #[napi]
    pub fn clear(achievement: String) -> bool {
        let client = crate::client::get_client();
        client
            .user_stats()
            .achievement(&achievement)
            .clear()
            .and_then(|_| client.user_stats().store_stats())
            .is_ok()
    }

    /// Returns the API names of all achievements defined for the app. Needs `init()`.
    /// Fails when Steam returns no list; the binding then panics. Unverified against a live Steam client: how that failure reaches JavaScript.
    /// @returns the achievement API names defined for the app.
    #[napi]
    pub fn names() -> Vec<String> {
        let client = crate::client::get_client();
        client
            .user_stats()
            .get_achievement_names()
            .expect("Failed to get achievement names")
    }

    /// Fetches the global unlock percentages of every achievement. Resolves once Steam has answered;
    /// the request is driven by `runCallbacks()`.
    #[napi]
    pub async fn request_global_percentages() -> Result<(), Error> {
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client
            .user_stats()
            .request_global_achievement_percentages(|result| {
                let _ = tx.send(result);
            });
        await_completion(rx, "requesting the global achievement percentages").await?;
        Ok(())
    }

    /// @returns the global percentage of players who unlocked the achievement (0 to 100), or `null` when no data is available.
    /// Call `requestGlobalPercentages()` first.
    #[napi]
    pub fn get_achieved_percent(achievement: String) -> Option<f64> {
        if achievement.contains('\0') {
            return None;
        }
        let client = crate::client::get_client();
        client
            .user_stats()
            .achievement(&achievement)
            .get_achievement_achieved_percent()
            .ok()
            .map(f64::from)
    }
}
