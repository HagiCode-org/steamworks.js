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
    /// Returns an empty array when the app defines no achievements or Steam has no list yet, so an empty result can mean either; use `getNumAchievements()` on `stats` to tell "not loaded" from a count.
    /// @returns the achievement API names defined for the app.
    #[napi]
    pub fn names() -> Vec<String> {
        let client = crate::client::get_client();
        client
            .user_stats()
            .get_achievement_names()
            .unwrap_or_default()
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

    /// The bounds of the progress stat that Steam links to an achievement.
    #[napi(object)]
    pub struct AchievementProgressLimits {
        /// Lowest value of the linked stat.
        pub min: f64,
        /// Value of the linked stat at which the achievement is complete.
        pub max: f64,
        /// `true` when the linked stat is a float stat, `false` when it is an integer stat.
        pub is_float: bool,
    }

    /// Everything Steam knows about one achievement for the local user, ready for display.
    #[napi(object)]
    pub struct AchievementInfo {
        /// The achievement API name as configured in Steamworks.
        pub name: String,
        /// Localized display name, or left out (`undefined`) when Steam has none (stats not received, or the achievement is not published).
        pub display_name: Option<String>,
        /// Localized description, or left out when Steam has none. Steam may return a placeholder text for hidden achievements that are still locked.
        pub description: Option<String>,
        /// `true` for a hidden achievement, left out when Steam does not say.
        pub hidden: Option<bool>,
        /// Whether the local user has unlocked the achievement.
        pub unlocked: bool,
        /// When the achievement was unlocked, in seconds since 1970-01-01 UTC (multiply by 1000 for `new Date()`). left out when the achievement is locked or Steam has no time for it. Steam reports `0` for unlocks before December 2009, which is also left out.
        pub unlock_time: Option<f64>,
        /// Global percentage of players who unlocked it (0 to 100). left out until `requestGlobalPercentages()` has resolved, or when Steam has no data (always for AppId 480).
        pub global_percent: Option<f64>,
        /// Bounds of the progress stat linked to the achievement, or left out when the achievement has none.
        pub progress_limits: Option<AchievementProgressLimits>,
    }

    /// An achievement icon as raw pixels.
    #[napi(object)]
    pub struct AchievementIcon {
        /// Width in pixels.
        pub width: u32,
        /// Height in pixels.
        pub height: u32,
        /// `width * height * 4` bytes of RGBA, row by row.
        pub rgba: napi::bindgen_prelude::Buffer,
    }

    fn display_attribute(
        helper: &steamworks::stats::AchievementHelper<'_>,
        key: &str,
    ) -> Option<String> {
        helper
            .get_achievement_display_attribute(key)
            .ok()
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    }

    fn progress_limits_of(
        helper: &steamworks::stats::AchievementHelper<'_>,
    ) -> Option<AchievementProgressLimits> {
        if let Ok((min, max)) = helper.get_achievement_progress_limits_i32() {
            return Some(AchievementProgressLimits {
                min: f64::from(min),
                max: f64::from(max),
                is_float: false,
            });
        }
        helper
            .get_achievement_progress_limits_f32()
            .ok()
            .map(|(min, max)| AchievementProgressLimits {
                min: f64::from(min),
                max: f64::from(max),
                is_float: true,
            })
    }

    fn info_of(name: &str) -> Option<AchievementInfo> {
        if name.contains('\0') {
            return None;
        }
        let client = crate::client::get_client();
        let user_stats = client.user_stats();
        let helper = user_stats.achievement(name);
        let (unlocked, raw_time) = helper.get_achievement_and_unlock_time().ok()?;
        Some(AchievementInfo {
            name: name.to_owned(),
            display_name: display_attribute(&helper, "name"),
            description: display_attribute(&helper, "desc"),
            hidden: display_attribute(&helper, "hidden").map(|value| value == "1"),
            unlocked,
            unlock_time: if unlocked && raw_time != 0 {
                Some(f64::from(raw_time))
            } else {
                None
            },
            global_percent: helper
                .get_achievement_achieved_percent()
                .ok()
                .map(f64::from),
            progress_limits: progress_limits_of(&helper),
        })
    }

    /// Reads everything needed to display one achievement: name, description, hidden flag, unlocked state, unlock time, global percentage and progress limits. Needs `init()`, which requests the user's stats.
    /// Call `requestGlobalPercentages()` first to get `globalPercent`; the icon is read separately with `getIcon()`.
    /// @param achievement - The achievement API name as configured in Steamworks.
    /// @returns the achievement, or `null` when Steam cannot read it (unknown name, or stats not received yet). That failure is not the same as a locked achievement.
    #[napi]
    pub fn get_info(achievement: String) -> Option<AchievementInfo> {
        info_of(&achievement)
    }

    /// Reads every achievement the app defines, in the order Steam lists them. Same data as `getInfo()` per entry.
    /// An achievement Steam cannot read is skipped, so compare the length with `stats.getNumAchievements()` to detect missing entries. Returns an empty array when the app defines no achievements or the stats are not loaded.
    /// Call `requestGlobalPercentages()` first to fill `globalPercent`.
    #[napi]
    pub fn get_all() -> Vec<AchievementInfo> {
        names().iter().filter_map(|name| info_of(name)).collect()
    }

    /// Returns when the user unlocked an achievement.
    /// @param achievement - The achievement API name as configured in Steamworks.
    /// @returns seconds since 1970-01-01 UTC, or `null` when the achievement is locked, Steam has no time for it, or the lookup fails.
    #[napi]
    pub fn get_unlock_time(achievement: String) -> Option<f64> {
        info_unlock_time(&achievement)
    }

    fn info_unlock_time(name: &str) -> Option<f64> {
        if name.contains('\0') {
            return None;
        }
        let client = crate::client::get_client();
        let (unlocked, time) = client
            .user_stats()
            .achievement(name)
            .get_achievement_and_unlock_time()
            .ok()?;
        if unlocked && time != 0 {
            Some(f64::from(time))
        } else {
            None
        }
    }

    /// Returns the bounds of the progress stat that Steam links to an achievement. The current value of that stat is not part of the achievement API; read it with `stats.getInt()` or `stats.getFloat()` using the stat name from the Steamworks configuration.
    /// @param achievement - The achievement API name as configured in Steamworks.
    /// @returns the limits, or `null` when the achievement has no linked progress stat or the lookup fails.
    #[napi]
    pub fn get_progress_limits(achievement: String) -> Option<AchievementProgressLimits> {
        if achievement.contains('\0') {
            return None;
        }
        let client = crate::client::get_client();
        let user_stats = client.user_stats();
        let helper = user_stats.achievement(&achievement);
        progress_limits_of(&helper)
    }

    /// Shows the Steam overlay progress notification for an achievement. It does not unlock the achievement, even when `current` equals `max`; call `activate()` for that.
    /// @param achievement - The achievement API name as configured in Steamworks.
    /// @param current - the progress reached
    /// @param max - the progress that completes the achievement
    /// @returns `true` when Steam accepted the request, otherwise `false`.
    #[napi]
    pub fn indicate_progress(achievement: String, current: u32, max: u32) -> bool {
        if achievement.contains('\0') {
            return false;
        }
        let client = crate::client::get_client();
        client
            .user_stats()
            .achievement(&achievement)
            .indicate_achievement_progress(current, max)
            .is_ok()
    }

    /// Reads the icon of an achievement as raw RGBA pixels, unlocked or locked according to the user's state (Steam chooses).
    /// @param achievement - The achievement API name as configured in Steamworks.
    /// @returns the icon, or `null` while Steam has not fetched it yet or when the achievement has no icon. Use `loadIcon()` to wait for it.
    #[napi]
    pub fn get_icon(achievement: String) -> Option<AchievementIcon> {
        read_icon(&achievement)
    }

    fn read_icon(name: &str) -> Option<AchievementIcon> {
        if name.contains('\0') {
            return None;
        }
        let client = crate::client::get_client();
        let icon = client
            .user_stats()
            .achievement(name)
            .get_achievement_icon_rgba()?;
        Some(AchievementIcon {
            width: icon.width,
            height: icon.height,
            rgba: icon.rgba.into(),
        })
    }

    /// Like `getIcon()`, but waits for Steam to fetch the icon. Steam answers inside `runCallbacks()`, which `init()` already runs on a timer.
    /// @param achievement - The achievement API name as configured in Steamworks.
    /// @param timeoutMs - how long to wait, in milliseconds; defaults to 5000
    /// @returns the icon, or `null` when it is still missing after the timeout (no icon is set, or Steam is slow). The two cases cannot be told apart.
    #[napi]
    pub async fn load_icon(
        achievement: String,
        timeout_ms: Option<u32>,
    ) -> Option<AchievementIcon> {
        let deadline = std::time::Instant::now()
            + std::time::Duration::from_millis(u64::from(timeout_ms.unwrap_or(5000)));
        loop {
            if let Some(icon) = read_icon(&achievement) {
                return Some(icon);
            }
            if std::time::Instant::now() >= deadline {
                return None;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }

    /// One entry of the global "most achieved" ranking, as returned by `getMostAchievedAchievements()`.
    #[napi(object)]
    pub struct AchievementRank {
        /// The achievement API name as configured in Steamworks.
        pub name: String,
        /// The global unlock percentage, from 0 to 100.
        pub percent: f64,
        /// Whether the local user has unlocked the achievement.
        pub achieved: bool,
    }

    /// Returns the app's achievements ranked by global unlock percentage, in the order Steam lists them (most achieved first).
    /// Call `requestGlobalPercentages()` first. Returns an empty array while the percentages are not loaded or when the app has no achievements.
    /// @returns the ranking, one entry per achievement
    #[napi]
    pub fn get_most_achieved_achievements() -> Vec<AchievementRank> {
        let client = crate::client::get_client();
        let user_stats = client.user_stats();
        let mut ranking = Vec::new();
        let mut current = user_stats.get_most_achieved_achievement_info();
        while let Some(entry) = current {
            let iterator = entry.iterator;
            ranking.push(AchievementRank {
                name: entry.name,
                percent: f64::from(entry.percent),
                achieved: entry.achieved,
            });
            current = user_stats.get_next_most_achieved_achievement_info(iterator);
        }
        ranking
    }
}
