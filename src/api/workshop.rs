use napi_derive::napi;

#[napi]
pub mod workshop {
    use napi::bindgen_prelude::{BigInt, Error};
    use napi::threadsafe_function::ErrorStrategy;
    use napi::threadsafe_function::ThreadsafeFunction;
    use napi::threadsafe_function::ThreadsafeFunctionCallMode;
    use std::path::Path;
    use steamworks::{FileType, PublishedFileId, SteamError, UpdateHandle};
    use tokio::sync::oneshot;

    #[napi(object)]
    pub struct UgcResult {
        pub item_id: BigInt,
        pub needs_to_accept_agreement: bool,
    }

    #[derive(Debug)]
    #[napi]
    pub enum UgcItemVisibility {
        Public,
        FriendsOnly,
        Private,
        Unlisted,
    }

    impl From<steamworks::PublishedFileVisibility> for UgcItemVisibility {
        fn from(visibility: steamworks::PublishedFileVisibility) -> Self {
            match visibility {
                steamworks::PublishedFileVisibility::Public => UgcItemVisibility::Public,
                steamworks::PublishedFileVisibility::FriendsOnly => UgcItemVisibility::FriendsOnly,
                steamworks::PublishedFileVisibility::Private => UgcItemVisibility::Private,
                steamworks::PublishedFileVisibility::Unlisted => UgcItemVisibility::Unlisted,
            }
        }
    }

    impl From<UgcItemVisibility> for steamworks::PublishedFileVisibility {
        fn from(val: UgcItemVisibility) -> Self {
            match val {
                UgcItemVisibility::Public => steamworks::PublishedFileVisibility::Public,
                UgcItemVisibility::FriendsOnly => steamworks::PublishedFileVisibility::FriendsOnly,
                UgcItemVisibility::Private => steamworks::PublishedFileVisibility::Private,
                UgcItemVisibility::Unlisted => steamworks::PublishedFileVisibility::Unlisted,
            }
        }
    }

    #[napi(object)]
    pub struct UgcUpdate {
        pub title: Option<String>,
        pub description: Option<String>,
        pub change_note: Option<String>,
        pub preview_path: Option<String>,
        /// Image files appended to the item's additional previews (screenshots).
        pub additional_preview_paths: Option<Vec<String>>,
        /// 0-based indexes of additional previews to remove, as listed in `additionalPreviews`.
        pub remove_additional_preview_indexes: Option<Vec<u32>>,
        pub content_path: Option<String>,
        pub tags: Option<Vec<String>>,
        pub visibility: Option<UgcItemVisibility>,
        pub language: Option<String>,
    }

    impl UgcUpdate {
        pub fn submit(
            self,
            mut update: UpdateHandle,
            callback: impl FnOnce(Result<(PublishedFileId, bool), steamworks::SteamError>)
                + Send
                + 'static,
        ) -> steamworks::UpdateWatchHandle {
            if let Some(language) = self.language {
                update = update.language(language.as_str());
            }

            if let Some(title) = self.title {
                update = update.title(title.as_str());
            }

            if let Some(description) = self.description {
                update = update.description(description.as_str());
            }

            if let Some(preview_path) = self.preview_path {
                update = update.preview_path(Path::new(&preview_path));
            }

            if let Some(mut indexes) = self.remove_additional_preview_indexes {
                // Remove from the highest index down, so a removal does not shift an index still to be removed.
                indexes.sort_unstable_by(|a, b| b.cmp(a));
                indexes.dedup();
                for index in indexes {
                    update = update.remove_preview(index);
                }
            }

            if let Some(paths) = self.additional_preview_paths {
                for path in paths {
                    update = update.add_preview_file(
                        Path::new(&path),
                        steamworks::sys::EItemPreviewType::k_EItemPreviewType_Image,
                    );
                }
            }

            if let Some(tags) = self.tags {
                update = update.tags(tags, false);
            }

            if let Some(content_path) = self.content_path {
                update = update.content_path(Path::new(&content_path));
            }

            if let Some(visibility) = self.visibility {
                update = update.visibility(visibility.into());
            }

            let change_note = self.change_note.as_deref();
            update.submit(change_note, callback)
        }
    }

    #[napi(object)]
    pub struct InstallInfo {
        pub folder: String,
        pub size_on_disk: BigInt,
        pub timestamp: u32,
    }

    #[napi(object)]
    pub struct DownloadInfo {
        pub current: BigInt,
        pub total: BigInt,
    }

    #[derive(Debug)]
    #[napi]
    pub enum UpdateStatus {
        Invalid,
        PreparingConfig,
        PreparingContent,
        UploadingContent,
        UploadingPreviewFile,
        CommittingChanges,
    }

    impl From<steamworks::UpdateStatus> for UpdateStatus {
        fn from(visibility: steamworks::UpdateStatus) -> Self {
            match visibility {
                steamworks::UpdateStatus::Invalid => UpdateStatus::Invalid,
                steamworks::UpdateStatus::PreparingConfig => UpdateStatus::PreparingConfig,
                steamworks::UpdateStatus::PreparingContent => UpdateStatus::PreparingContent,
                steamworks::UpdateStatus::UploadingContent => UpdateStatus::UploadingContent,
                steamworks::UpdateStatus::UploadingPreviewFile => {
                    UpdateStatus::UploadingPreviewFile
                }
                steamworks::UpdateStatus::CommittingChanges => UpdateStatus::CommittingChanges,
            }
        }
    }

    #[napi(object)]
    pub struct UpdateProgress {
        pub status: UpdateStatus,
        pub progress: BigInt,
        pub total: BigInt,
    }

    #[napi]
    pub async fn create_item(app_id: Option<u32>) -> Result<UgcResult, Error> {
        let client = crate::client::get_client();
        let app_id = app_id
            .map(steamworks::AppId)
            .unwrap_or_else(|| client.utils().app_id());

        let (tx, rx) = oneshot::channel();

        client
            .ugc()
            .create_item(app_id, FileType::Community, |result| {
                send_completion(tx, result);
            });

        let (item_id, needs_to_accept_agreement) =
            await_completion(rx, "creating the Workshop item").await?;
        Ok(UgcResult {
            item_id: BigInt::from(item_id.0),
            needs_to_accept_agreement,
        })
    }

    #[napi]
    pub async fn update_item(
        item_id: BigInt,
        update_details: UgcUpdate,
        app_id: Option<u32>,
    ) -> Result<UgcResult, Error> {
        submit_item_update(item_id, update_details, app_id).await
    }

    /// Replace only the main preview image of a Workshop item.
    ///
    /// The mod content is not sent: nothing is uploaded from a content folder, and the title,
    /// description, tags and visibility stay as they are.
    ///
    /// @param itemId - the Workshop item to update
    /// @param previewPath - absolute path of an existing image file
    /// @param appId - defaults to the app id the client was initialized with
    /// @param changeNote - optional change note shown in the item's change history
    #[napi]
    pub async fn update_item_preview(
        item_id: BigInt,
        preview_path: String,
        app_id: Option<u32>,
        change_note: Option<String>,
    ) -> Result<UgcResult, Error> {
        let metadata = std::fs::metadata(&preview_path).map_err(|e| {
            Error::from_reason(format!(
                "the Workshop preview file `{preview_path}` cannot be read: {e}"
            ))
        })?;
        if !metadata.is_file() {
            return Err(Error::from_reason(format!(
                "the Workshop preview path `{preview_path}` is not a file"
            )));
        }

        submit_item_update(
            item_id,
            UgcUpdate {
                title: None,
                description: None,
                change_note,
                preview_path: Some(preview_path),
                additional_preview_paths: None,
                remove_additional_preview_indexes: None,
                content_path: None,
                tags: None,
                visibility: None,
                language: None,
            },
            app_id,
        )
        .await
    }

    /// Upload only the content folder of a Workshop item.
    ///
    /// The preview image is not touched, and the title, description, tags and visibility stay as
    /// they are.
    ///
    /// @param itemId - the Workshop item to update
    /// @param contentPath - absolute path of an existing folder with the mod files
    /// @param appId - defaults to the app id the client was initialized with
    /// @param changeNote - optional change note shown in the item's change history
    #[napi]
    pub async fn update_item_content(
        item_id: BigInt,
        content_path: String,
        app_id: Option<u32>,
        change_note: Option<String>,
    ) -> Result<UgcResult, Error> {
        let metadata = std::fs::metadata(&content_path).map_err(|e| {
            Error::from_reason(format!(
                "the Workshop content folder `{content_path}` cannot be read: {e}"
            ))
        })?;
        if !metadata.is_dir() {
            return Err(Error::from_reason(format!(
                "the Workshop content path `{content_path}` is not a folder"
            )));
        }

        submit_item_update(
            item_id,
            UgcUpdate {
                title: None,
                description: None,
                change_note,
                preview_path: None,
                additional_preview_paths: None,
                remove_additional_preview_indexes: None,
                content_path: Some(content_path),
                tags: None,
                visibility: None,
                language: None,
            },
            app_id,
        )
        .await
    }

    async fn submit_item_update(
        item_id: BigInt,
        update_details: UgcUpdate,
        app_id: Option<u32>,
    ) -> Result<UgcResult, Error> {
        let client = crate::client::get_client();

        let app_id = app_id
            .map(steamworks::AppId)
            .unwrap_or_else(|| client.utils().app_id());

        let (tx, rx) = oneshot::channel();

        {
            let update_handle = client
                .ugc()
                .start_item_update(app_id, PublishedFileId(item_id.get_u64().1));

            update_details.submit(update_handle, |result| {
                send_completion(tx, result);
            });
        };

        let (item_id, needs_to_accept_agreement) =
            await_completion(rx, "updating the Workshop item").await?;
        Ok(UgcResult {
            item_id: BigInt::from(item_id.0),
            needs_to_accept_agreement,
        })
    }

    #[napi]
    pub fn update_item_with_callback(
        item_id: BigInt,
        update_details: UgcUpdate,
        app_id: Option<u32>,

        #[napi(ts_arg_type = "(data: UgcResult) => void")] success_callback: napi::JsFunction,

        #[napi(ts_arg_type = "(err: any) => void")] error_callback: napi::JsFunction,

        #[napi(ts_arg_type = "(data: UpdateProgress) => void")] progress_callback: Option<
            napi::JsFunction,
        >,

        progress_callback_interval_ms: Option<u32>,
    ) {
        let success_callback: ThreadsafeFunction<UgcResult, ErrorStrategy::Fatal> =
            success_callback
                .create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))
                .unwrap();
        let error_callback: ThreadsafeFunction<Error, ErrorStrategy::Fatal> = error_callback
            .create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))
            .unwrap();

        let client = crate::client::get_client();

        let app_id = app_id
            .map(steamworks::AppId)
            .unwrap_or_else(|| client.utils().app_id());

        {
            let update_handle = client
                .ugc()
                .start_item_update(app_id, PublishedFileId(item_id.get_u64().1));

            let update_watch_handle = update_details.submit(update_handle, move |result| {
                match result {
                    Ok((item_id, needs_to_accept_agreement)) => success_callback.call(
                        UgcResult {
                            item_id: BigInt::from(item_id.0),
                            needs_to_accept_agreement,
                        },
                        ThreadsafeFunctionCallMode::Blocking,
                    ),
                    Err(e) => error_callback.call(
                        Error::from_reason(e.to_string()),
                        ThreadsafeFunctionCallMode::Blocking,
                    ),
                };
            });

            if let Some(progress_callback) = progress_callback {
                let progress_callback: ThreadsafeFunction<UpdateProgress, ErrorStrategy::Fatal> =
                    progress_callback
                        .create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))
                        .unwrap();

                std::thread::spawn(move || loop {
                    let (status, progress, total) = update_watch_handle.progress();
                    let value = UpdateProgress {
                        status: status.into(),
                        progress: BigInt::from(progress),
                        total: BigInt::from(total),
                    };
                    progress_callback.call(value, ThreadsafeFunctionCallMode::Blocking);
                    match status {
                        steamworks::UpdateStatus::Invalid => break,
                        steamworks::UpdateStatus::CommittingChanges => break,
                        _ => (),
                    }
                    std::thread::sleep(std::time::Duration::from_millis(
                        progress_callback_interval_ms.unwrap_or(1000) as u64,
                    ));
                });
            }
        };
    }

    /// Subscribe to a workshop item. It will be downloaded and installed as soon as possible.
    ///
    /// {@link https://partner.steamgames.com/doc/api/ISteamUGC#SubscribeItem}
    #[napi]
    pub async fn subscribe(item_id: BigInt) -> Result<(), Error> {
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client
            .ugc()
            .subscribe_item(PublishedFileId(item_id.get_u64().1), |result| {
                send_completion(tx, result);
            });

        await_completion(rx, "subscribing to the Workshop item").await
    }

    /// Unsubscribe from a workshop item. This will result in the item being removed after the game quits.
    ///
    /// {@link https://partner.steamgames.com/doc/api/ISteamUGC#UnsubscribeItem}
    #[napi]
    pub async fn unsubscribe(item_id: BigInt) -> Result<(), Error> {
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client
            .ugc()
            .unsubscribe_item(PublishedFileId(item_id.get_u64().1), |result| {
                send_completion(tx, result);
            });

        await_completion(rx, "unsubscribing from the Workshop item").await
    }

    /// Gets the current state of a workshop item on this client. States can be combined.
    ///
    /// @returns a number with the current item state, e.g. 9
    /// 9 = 1 (The current user is subscribed to this item) + 8 (The item needs an update)
    ///
    /// {@link https://partner.steamgames.com/doc/api/ISteamUGC#GetItemState}
    /// {@link https://partner.steamgames.com/doc/api/ISteamUGC#EItemState}
    #[napi]
    pub fn state(item_id: BigInt) -> u32 {
        let client = crate::client::get_client();
        let result = client
            .ugc()
            .item_state(PublishedFileId(item_id.get_u64().1));

        result.bits()
    }

    /// Gets info about currently installed content on the disc for workshop item.
    ///
    /// @returns an object with the the properties {folder, size_on_disk, timestamp}
    ///
    /// {@link https://partner.steamgames.com/doc/api/ISteamUGC#GetItemInstallInfo}
    #[napi]
    pub fn install_info(item_id: BigInt) -> Option<InstallInfo> {
        let client = crate::client::get_client();
        let result = client
            .ugc()
            .item_install_info(PublishedFileId(item_id.get_u64().1));

        match result {
            Some(install_info) => Some(InstallInfo {
                folder: install_info.folder,
                size_on_disk: BigInt::from(install_info.size_on_disk),
                timestamp: install_info.timestamp,
            }),
            None => None,
        }
    }

    /// Get info about a pending download of a workshop item.
    ///
    /// @returns an object with the properties {current, total}
    ///
    /// {@link https://partner.steamgames.com/doc/api/ISteamUGC#GetItemDownloadInfo}
    #[napi]
    pub fn download_info(item_id: BigInt) -> Option<DownloadInfo> {
        let client = crate::client::get_client();
        let result = client
            .ugc()
            .item_download_info(PublishedFileId(item_id.get_u64().1));

        result.map(|download_info| DownloadInfo {
            current: BigInt::from(download_info.0),
            total: BigInt::from(download_info.1),
        })
    }

    /// Download or update a workshop item.
    ///
    /// @param highPriority - If high priority is true, start the download in high priority mode, pausing any existing in-progress Steam downloads and immediately begin downloading this workshop item.
    /// @returns true or false
    ///
    /// {@link https://partner.steamgames.com/doc/api/ISteamUGC#DownloadItem}
    #[napi]
    pub fn download(item_id: BigInt, high_priority: bool) -> bool {
        let client = crate::client::get_client();
        client
            .ugc()
            .download_item(PublishedFileId(item_id.get_u64().1), high_priority)
    }

    /// Get all subscribed workshop items.
    /// @returns an array of subscribed workshop item ids
    #[napi]
    pub fn get_subscribed_items() -> Vec<BigInt> {
        let client = crate::client::get_client();
        let result = client.ugc().subscribed_items(false);

        result
            .iter()
            .map(|item| BigInt::from(item.0))
            .collect::<Vec<_>>()
    }

    // Deletes an item
    // @returns true or false
    #[napi]
    pub async fn delete_item(item_id: BigInt) -> Result<(), Error> {
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client
            .ugc()
            .delete_item(PublishedFileId(item_id.get_u64().1), |result| {
                send_completion(tx, result);
            });

        await_completion(rx, "deleting the Workshop item").await
    }

    /// Marks `childId` as a required item of `parentId`. Resolves with the Steam result code, where `1` is
    /// OK. A non-OK code (for example a missing child or a denied request) resolves rather than rejects.
    /// Rejects on an invalid id (checked before any Steam call), an I/O failure, or a lost completion.
    #[napi]
    pub async fn add_dependency(parent_id: BigInt, child_id: BigInt) -> Result<u32, Error> {
        let parent = published_file_id_arg("parentId", &parent_id)?;
        let child = published_file_id_arg("childId", &child_id)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client.ugc().add_dependency(parent, child, |result| {
            send_completion(tx, result);
        });

        let outcome = await_completion(rx, "adding the Workshop item dependency").await?;
        Ok(outcome.result)
    }

    /// Removes the required-item dependency from `parentId` to `childId`. Resolves with the Steam result
    /// code (`1` is OK), with the same validation and rejection rules as `addDependency`.
    #[napi]
    pub async fn remove_dependency(parent_id: BigInt, child_id: BigInt) -> Result<u32, Error> {
        let parent = published_file_id_arg("parentId", &parent_id)?;
        let child = published_file_id_arg("childId", &child_id)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client.ugc().remove_dependency(parent, child, |result| {
            send_completion(tx, result);
        });

        let outcome = await_completion(rx, "removing the Workshop item dependency").await?;
        Ok(outcome.result)
    }

    /// Reads a Workshop item id argument. It must be a non-negative integer below 2^64. Anything else is
    /// rejected here, before any Steam call, instead of being truncated to its low 64 bits.
    pub(crate) fn published_file_id_arg(name: &str, id: &BigInt) -> Result<PublishedFileId, Error> {
        // Read the words directly: BigInt::get_u64 indexes words[0] and panics on an empty vector.
        let low = id.words.first().copied().unwrap_or(0);
        let fits_in_u64 = id.words.iter().skip(1).all(|word| *word == 0);
        if !fits_in_u64 || (id.sign_bit && low != 0) {
            return Err(Error::new(
                napi::Status::InvalidArg,
                format!("{name} must be a non-negative integer below 2^64"),
            ));
        }
        Ok(PublishedFileId(low))
    }

    /// Hand a Steam completion to the awaiting call. If nobody is waiting any more the value is
    /// dropped: this runs on Steam's callback path, and a panic there would abort the process.
    pub(crate) fn send_completion<T>(tx: oneshot::Sender<T>, value: T) {
        let _ = tx.send(value);
    }

    /// Wait for a Steam completion. A closed channel means no completion arrived, so the outcome
    /// of the operation is unknown and the caller must check the item before deciding.
    pub(crate) async fn await_completion<T>(
        rx: oneshot::Receiver<Result<T, SteamError>>,
        operation: &str,
    ) -> Result<T, Error> {
        match rx.await {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(e)) => Err(Error::from_reason(e.to_string())),
            Err(_) => Err(Error::from_reason(format!(
                "The completion of {operation} was not received; the outcome is unknown. Check the item before retrying."
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::workshop::{await_completion, published_file_id_arg, send_completion};
    use napi::bindgen_prelude::BigInt;
    use steamworks::{PublishedFileId, SteamError};
    use tokio::sync::oneshot;

    #[test]
    fn normal_item_id_is_accepted() {
        let id = BigInt {
            sign_bit: false,
            words: vec![3836453389],
        };
        assert_eq!(
            published_file_id_arg("parentId", &id).unwrap(),
            PublishedFileId(3836453389)
        );
    }

    #[test]
    fn largest_64_bit_item_id_is_accepted() {
        let id = BigInt {
            sign_bit: false,
            words: vec![u64::MAX],
        };
        assert_eq!(
            published_file_id_arg("parentId", &id).unwrap(),
            PublishedFileId(u64::MAX)
        );
    }

    #[test]
    fn negative_item_id_is_rejected() {
        let id = BigInt {
            sign_bit: true,
            words: vec![1],
        };
        let error = published_file_id_arg("childId", &id).unwrap_err();
        assert_eq!(error.status, napi::Status::InvalidArg);
        assert!(
            error.reason.contains("childId"),
            "reason was: {}",
            error.reason
        );
    }

    #[test]
    fn item_id_larger_than_64_bits_is_rejected() {
        let id = BigInt {
            sign_bit: false,
            words: vec![0, 1],
        };
        let error = published_file_id_arg("childId", &id).unwrap_err();
        assert_eq!(error.status, napi::Status::InvalidArg);
    }

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    #[test]
    fn completion_with_dropped_receiver_does_not_panic() {
        let (tx, rx) = oneshot::channel::<Result<(), SteamError>>();
        drop(rx);
        send_completion(tx, Ok(()));
    }

    #[test]
    fn dropped_sender_gives_a_readable_outcome_unknown_error() {
        let (tx, rx) = oneshot::channel::<Result<(), SteamError>>();
        drop(tx);
        let error = runtime()
            .block_on(await_completion(rx, "deleting the Workshop item"))
            .unwrap_err();
        assert!(
            error.reason.contains("completion"),
            "reason was: {}",
            error.reason
        );
        assert!(
            error.reason.contains("not received"),
            "reason was: {}",
            error.reason
        );
        assert!(
            error.reason.contains("outcome is unknown"),
            "reason was: {}",
            error.reason
        );
        assert!(
            !error.reason.contains("RecvError"),
            "reason was: {}",
            error.reason
        );
    }

    #[test]
    fn delivered_success_resolves_with_the_value() {
        let (tx, rx) = oneshot::channel::<Result<u32, SteamError>>();
        send_completion(tx, Ok(7));
        assert_eq!(runtime().block_on(await_completion(rx, "op")).unwrap(), 7);
    }

    #[test]
    fn delivered_steam_error_keeps_its_number() {
        let (tx, rx) = oneshot::channel::<Result<(), SteamError>>();
        send_completion(tx, Err(SteamError::UnknownResult(1234)));
        let error = runtime().block_on(await_completion(rx, "op")).unwrap_err();
        assert!(
            error.reason.contains("1234"),
            "reason was: {}",
            error.reason
        );
        assert!(
            !error.reason.contains("not received"),
            "reason was: {}",
            error.reason
        );
    }
}
