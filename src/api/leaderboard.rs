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
    }
}
