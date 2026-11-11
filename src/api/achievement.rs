use napi_derive::napi;

#[napi]
pub mod achievement {
    use crate::api::workshop::workshop::await_completion;
    use napi::bindgen_prelude::Error;
    use tokio::sync::oneshot;

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

    #[napi]
    pub fn is_activated(achievement: String) -> bool {
        let client = crate::client::get_client();
        client
            .user_stats()
            .achievement(&achievement)
            .get()
            .unwrap_or(false)
    }

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
