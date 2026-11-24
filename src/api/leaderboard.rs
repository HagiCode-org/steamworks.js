use napi_derive::napi;

#[napi]
pub mod leaderboard {
    use crate::api::workshop::workshop::await_completion;
    use napi::bindgen_prelude::{BigInt, Error};
    use tokio::sync::oneshot;

    #[napi]
    pub enum LeaderboardSortMethod {
        Ascending,
        Descending,
    }

    #[napi]
    pub enum LeaderboardDisplayType {
        Numeric,
        TimeSeconds,
        TimeMilliSeconds,
    }

    #[napi]
    pub enum LeaderboardDataRequest {
        Global,
        GlobalAroundUser,
        Friends,
    }

    #[napi]
    pub enum UploadScoreMethod {
        /// Keeps the better of the existing score and the new one.
        KeepBest,
        /// Replaces the existing score, even when it is worse.
        ForceUpdate,
    }

    #[napi(object)]
    pub struct LeaderboardScoreUploaded {
        /// The score Steam stored for the user.
        pub score: i32,
        /// `false` when the uploaded score did not replace the existing one.
        pub was_changed: bool,
        pub global_rank_new: i32,
        pub global_rank_previous: i32,
    }

    #[napi(object)]
    pub struct LeaderboardEntry {
        pub steam_id64: BigInt,
        pub global_rank: i32,
        pub score: i32,
        pub details: Vec<i32>,
    }

    /// A leaderboard handle returned by `find` or `findOrCreate`.
    #[napi]
    pub struct Leaderboard {
        inner: steamworks::Leaderboard,
    }

    fn check_no_nul(value: &str, field: &str) -> Result<(), Error> {
        if value.contains('\0') {
            return Err(Error::from_reason(format!(
                "{field} must not contain a NUL character"
            )));
        }
        Ok(())
    }

    /// The most users the SDK accepts in one `DownloadLeaderboardEntriesForUsers` call.
    const MAX_USERS_PER_DOWNLOAD: usize = 100;

    /// Reads a non-negative 64-bit value from a BigInt. Returns `None` for a negative value or one that does not fit in 64 bits.
    fn u64_from_bigint(value: &BigInt) -> Option<u64> {
        let (signed, raw, lossless) = value.get_u64();
        (!signed && lossless).then_some(raw)
    }

    /// Reads a SteamID from a BigInt. Returns `None` for a negative value or one that does not fit in 64 bits.
    fn steam_id_from_bigint(value: &BigInt) -> Option<steamworks::SteamId> {
        u64_from_bigint(value).map(steamworks::SteamId::from_raw)
    }

    impl From<LeaderboardSortMethod> for steamworks::LeaderboardSortMethod {
        fn from(value: LeaderboardSortMethod) -> Self {
            match value {
                LeaderboardSortMethod::Ascending => steamworks::LeaderboardSortMethod::Ascending,
                LeaderboardSortMethod::Descending => steamworks::LeaderboardSortMethod::Descending,
            }
        }
    }

    impl From<steamworks::LeaderboardSortMethod> for LeaderboardSortMethod {
        fn from(value: steamworks::LeaderboardSortMethod) -> Self {
            match value {
                steamworks::LeaderboardSortMethod::Ascending => LeaderboardSortMethod::Ascending,
                steamworks::LeaderboardSortMethod::Descending => LeaderboardSortMethod::Descending,
            }
        }
    }

    impl From<LeaderboardDisplayType> for steamworks::LeaderboardDisplayType {
        fn from(value: LeaderboardDisplayType) -> Self {
            match value {
                LeaderboardDisplayType::Numeric => steamworks::LeaderboardDisplayType::Numeric,
                LeaderboardDisplayType::TimeSeconds => {
                    steamworks::LeaderboardDisplayType::TimeSeconds
                }
                LeaderboardDisplayType::TimeMilliSeconds => {
                    steamworks::LeaderboardDisplayType::TimeMilliSeconds
                }
            }
        }
    }

    impl From<steamworks::LeaderboardDisplayType> for LeaderboardDisplayType {
        fn from(value: steamworks::LeaderboardDisplayType) -> Self {
            match value {
                steamworks::LeaderboardDisplayType::Numeric => LeaderboardDisplayType::Numeric,
                steamworks::LeaderboardDisplayType::TimeSeconds => {
                    LeaderboardDisplayType::TimeSeconds
                }
                steamworks::LeaderboardDisplayType::TimeMilliSeconds => {
                    LeaderboardDisplayType::TimeMilliSeconds
                }
            }
        }
    }

    impl From<LeaderboardDataRequest> for steamworks::LeaderboardDataRequest {
        fn from(value: LeaderboardDataRequest) -> Self {
            match value {
                LeaderboardDataRequest::Global => steamworks::LeaderboardDataRequest::Global,
                LeaderboardDataRequest::GlobalAroundUser => {
                    steamworks::LeaderboardDataRequest::GlobalAroundUser
                }
                LeaderboardDataRequest::Friends => steamworks::LeaderboardDataRequest::Friends,
            }
        }
    }

    impl From<UploadScoreMethod> for steamworks::UploadScoreMethod {
        fn from(value: UploadScoreMethod) -> Self {
            match value {
                UploadScoreMethod::KeepBest => steamworks::UploadScoreMethod::KeepBest,
                UploadScoreMethod::ForceUpdate => steamworks::UploadScoreMethod::ForceUpdate,
            }
        }
    }

    impl From<steamworks::LeaderboardScoreUploaded> for LeaderboardScoreUploaded {
        fn from(value: steamworks::LeaderboardScoreUploaded) -> Self {
            Self {
                score: value.score,
                was_changed: value.was_changed,
                global_rank_new: value.global_rank_new,
                global_rank_previous: value.global_rank_previous,
            }
        }
    }

    impl From<steamworks::LeaderboardEntry> for LeaderboardEntry {
        fn from(value: steamworks::LeaderboardEntry) -> Self {
            Self {
                steam_id64: BigInt::from(value.user.raw()),
                global_rank: value.global_rank,
                score: value.score,
                details: value.details,
            }
        }
    }

    /// Finds a leaderboard by name.
    /// @returns the leaderboard, or `null` when no leaderboard has that name
    #[napi]
    pub async fn find(name: String) -> Result<Option<Leaderboard>, Error> {
        check_no_nul(&name, "name")?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client.user_stats().find_leaderboard(&name, |result| {
            let _ = tx.send(result);
        });
        let found = await_completion(rx, "finding the leaderboard").await?;
        Ok(found.map(|inner| Leaderboard { inner }))
    }

    /// Finds a leaderboard by name, creating it with the given sort method and display type when it does not exist.
    /// @returns the leaderboard, or `null` when Steam could not find or create it
    #[napi]
    pub async fn find_or_create(
        name: String,
        sort_method: LeaderboardSortMethod,
        display_type: LeaderboardDisplayType,
    ) -> Result<Option<Leaderboard>, Error> {
        check_no_nul(&name, "name")?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client.user_stats().find_or_create_leaderboard(
            &name,
            sort_method.into(),
            display_type.into(),
            |result| {
                let _ = tx.send(result);
            },
        );
        let found = await_completion(rx, "finding or creating the leaderboard").await?;
        Ok(found.map(|inner| Leaderboard { inner }))
    }

    #[napi]
    impl Leaderboard {
        /// @returns the leaderboard name
        #[napi]
        pub fn get_name(&self) -> String {
            let client = crate::client::get_client();
            client.user_stats().get_leaderboard_name(&self.inner)
        }

        /// @returns the number of entries on the leaderboard
        #[napi]
        pub fn get_entry_count(&self) -> i32 {
            let client = crate::client::get_client();
            client.user_stats().get_leaderboard_entry_count(&self.inner)
        }

        /// @returns the sort method, or `null` when Steam does not report one
        #[napi]
        pub fn get_sort_method(&self) -> Option<LeaderboardSortMethod> {
            let client = crate::client::get_client();
            client
                .user_stats()
                .get_leaderboard_sort_method(&self.inner)
                .map(LeaderboardSortMethod::from)
        }

        /// @returns the display type, or `null` when Steam does not report one
        #[napi]
        pub fn get_display_type(&self) -> Option<LeaderboardDisplayType> {
            let client = crate::client::get_client();
            client
                .user_stats()
                .get_leaderboard_display_type(&self.inner)
                .map(LeaderboardDisplayType::from)
        }

        /// Uploads a score for the local user.
        /// @param details - integers stored with the score alongside it
        /// @returns the result, or `null` when Steam reports that the upload did not succeed
        #[napi]
        pub async fn upload_score(
            &self,
            method: UploadScoreMethod,
            score: i32,
            details: Vec<i32>,
        ) -> Result<Option<LeaderboardScoreUploaded>, Error> {
            let client = crate::client::get_client();
            let (tx, rx) = oneshot::channel();
            client.user_stats().upload_leaderboard_score(
                &self.inner,
                method.into(),
                score,
                &details,
                |result| {
                    let _ = tx.send(result);
                },
            );
            let uploaded = await_completion(rx, "uploading the leaderboard score").await?;
            Ok(uploaded.map(LeaderboardScoreUploaded::from))
        }

        /// Downloads leaderboard entries for a range of ranks.
        /// @param start - first rank index (0-based) in the requested range
        /// @param end - last rank index (exclusive) in the requested range
        /// @param maxDetails - maximum number of detail integers returned per entry
        #[napi]
        pub async fn download_entries(
            &self,
            request: LeaderboardDataRequest,
            start: u32,
            end: u32,
            max_details: u32,
        ) -> Result<Vec<LeaderboardEntry>, Error> {
            let client = crate::client::get_client();
            let (tx, rx) = oneshot::channel();
            client.user_stats().download_leaderboard_entries(
                &self.inner,
                request.into(),
                start as usize,
                end as usize,
                max_details as usize,
                |result| {
                    let _ = tx.send(result);
                },
            );
            let entries = await_completion(rx, "downloading the leaderboard entries").await?;
            Ok(entries.into_iter().map(LeaderboardEntry::from).collect())
        }

        /// Attaches a piece of cloud content to the local user's entry on this leaderboard. This changes the user's leaderboard data on Steam.
        /// @param ugcHandle - the UGC handle of the content, as a BigInt (for example the value returned by `cloud.shareFile()`)
        /// @returns resolves when Steam accepts the attachment; rejects with Steam's error otherwise, or when the handle is not a valid 64-bit value
        #[napi]
        pub async fn attach_ugc(&self, ugc_handle: BigInt) -> Result<(), Error> {
            let handle = u64_from_bigint(&ugc_handle).ok_or_else(|| {
                Error::from_reason("ugcHandle must be a non-negative 64-bit value")
            })?;
            let client = crate::client::get_client();
            let (tx, rx) = oneshot::channel();
            client
                .user_stats()
                .attach_leaderboard_ugc(&self.inner, handle, |result| {
                    let _ = tx.send(result);
                });
            await_completion(rx, "attaching the content to the leaderboard").await?;
            Ok(())
        }

        /// Downloads the leaderboard entries of the given users only. A user with no entry on this leaderboard is left out of the result.
        /// Steam accepts at most 100 users per request and only one such request at a time; this binding rejects more than 100 before it calls Steam.
        /// @param steamIds64 - the users' 64-bit SteamIDs, at most 100
        /// @param maxDetails - maximum number of detail integers returned per entry
        /// @returns the entries Steam returns, in Steam's order
        #[napi]
        pub async fn download_entries_for_users(
            &self,
            steam_ids64: Vec<BigInt>,
            max_details: u32,
        ) -> Result<Vec<LeaderboardEntry>, Error> {
            if steam_ids64.len() > MAX_USERS_PER_DOWNLOAD {
                return Err(Error::from_reason(
                    "at most 100 users can be downloaded at a time",
                ));
            }
            let mut users = Vec::with_capacity(steam_ids64.len());
            for id in &steam_ids64 {
                users.push(steam_id_from_bigint(id).ok_or_else(|| {
                    Error::from_reason("steamIds64 must contain valid 64-bit SteamIDs")
                })?);
            }
            let client = crate::client::get_client();
            let (tx, rx) = oneshot::channel();
            client.user_stats().download_leaderboard_entries_for_users(
                &self.inner,
                &users,
                max_details as usize,
                |result| {
                    let _ = tx.send(result);
                },
            );
            let entries =
                await_completion(rx, "downloading the leaderboard entries of the users").await?;
            Ok(entries.into_iter().map(LeaderboardEntry::from).collect())
        }
    }
}
