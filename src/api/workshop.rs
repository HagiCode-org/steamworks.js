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

    /// Workshop file types for `createItem`. Omitting the argument keeps `Community`.
    #[derive(Debug)]
    #[napi]
    pub enum WorkshopFileType {
        Community,
        Art,
        Screenshot,
        Video,
        Collection,
        WebGuide,
        IntegratedGuide,
    }

    impl From<WorkshopFileType> for FileType {
        fn from(file_type: WorkshopFileType) -> Self {
            match file_type {
                WorkshopFileType::Community => FileType::Community,
                WorkshopFileType::Art => FileType::Art,
                WorkshopFileType::Screenshot => FileType::Screenshot,
                WorkshopFileType::Video => FileType::Video,
                WorkshopFileType::Collection => FileType::Collection,
                WorkshopFileType::WebGuide => FileType::WebGuide,
                WorkshopFileType::IntegratedGuide => FileType::IntegratedGuide,
            }
        }
    }

    /// The file type of a new item: `Community` when the caller did not pass one.
    pub(crate) fn file_type_or_community(file_type: Option<WorkshopFileType>) -> FileType {
        file_type.map(FileType::from).unwrap_or(FileType::Community)
    }

    /// Steam's community content descriptors. The values are the SDK's own IDs.
    #[derive(Debug)]
    #[napi]
    pub enum WorkshopContentDescriptor {
        NudityOrSexualContent = 1,
        FrequentViolenceOrGore = 2,
        AdultOnlySexualContent = 3,
        GratuitousSexualContent = 4,
        AnyMatureContent = 5,
    }

    impl From<WorkshopContentDescriptor> for steamworks::UGCContentDescriptorID {
        fn from(descriptor: WorkshopContentDescriptor) -> Self {
            match descriptor {
                WorkshopContentDescriptor::NudityOrSexualContent => Self::NudityOrSexualContent,
                WorkshopContentDescriptor::FrequentViolenceOrGore => Self::FrequentViolenceOrGore,
                WorkshopContentDescriptor::AdultOnlySexualContent => Self::AdultOnlySexualContent,
                WorkshopContentDescriptor::GratuitousSexualContent => Self::GratuitousSexualContent,
                WorkshopContentDescriptor::AnyMatureContent => Self::AnyMatureContent,
            }
        }
    }

    /// One key-value tag, stored on the item as `key=value`.
    #[napi(object)]
    pub struct KeyValueTag {
        pub key: String,
        pub value: String,
    }

    /// Key-value tag changes. They are applied in the order clear, remove, add.
    #[napi(object)]
    pub struct KeyValueTagsUpdate {
        /// Removes every key-value tag of the item first.
        pub clear: Option<bool>,
        /// Keys whose values are all removed.
        pub remove: Option<Vec<String>>,
        /// Pairs added after the removals.
        pub add: Option<Vec<KeyValueTag>>,
    }

    /// Content descriptor changes. Removals are applied before additions.
    #[napi(object)]
    pub struct ContentDescriptorsUpdate {
        pub remove: Option<Vec<WorkshopContentDescriptor>>,
        pub add: Option<Vec<WorkshopContentDescriptor>>,
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
        /// Oldest game version (Steam branch, e.g. `open_beta`) the item is valid for.
        /// Set either required-version field to change the range; the unset end becomes open.
        /// Pass both as `""` to make the item valid for every game version again.
        /// Steam applies the range only when this update also changes the item's content.
        pub required_game_version_min: Option<String>,
        /// Newest game version (Steam branch) the item is valid for; see `requiredGameVersionMin`.
        pub required_game_version_max: Option<String>,
        /// YouTube video IDs (11 characters each) added as video previews. Checked before submission.
        pub additional_preview_videos: Option<Vec<String>>,
        /// Developer metadata set on the item. Left unchanged when omitted.
        pub metadata: Option<String>,
        /// Key-value tag changes, applied in the order clear, remove, add.
        pub key_value_tags: Option<KeyValueTagsUpdate>,
        /// Content descriptor changes, applied as removals then additions.
        pub content_descriptors: Option<ContentDescriptorsUpdate>,
    }

    impl UgcUpdate {
        /// Checks the new fields before anything is sent to Steam. A failure names the bad entry and
        /// no update is submitted. Strings are also checked for NUL bytes, which the SDK cannot carry.
        pub fn check(&self) -> Result<(), Error> {
            for id in self.additional_preview_videos.iter().flatten() {
                check_video_id(id)?;
            }
            if let Some(metadata) = &self.metadata {
                check_no_nul("metadata", metadata)?;
            }
            if let Some(key_value_tags) = &self.key_value_tags {
                for key in key_value_tags.remove.iter().flatten() {
                    check_no_nul("keyValueTags.remove", key)?;
                }
                for pair in key_value_tags.add.iter().flatten() {
                    check_no_nul("keyValueTags.add key", &pair.key)?;
                    check_no_nul("keyValueTags.add value", &pair.value)?;
                }
            }
            Ok(())
        }

        /// Applies the update to `update` and submits it. Returns an error before submission when a
        /// video ID is refused by steamworks-rs; `check` already rejects the same entries first.
        pub fn submit(
            self,
            mut update: UpdateHandle,
            callback: impl FnOnce(Result<(PublishedFileId, bool), steamworks::SteamError>)
                + Send
                + 'static,
        ) -> Result<steamworks::UpdateWatchHandle, SteamError> {
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

            if let Some(metadata) = self.metadata {
                update = update.metadata(metadata.as_str());
            }

            if let Some(key_value_tags) = self.key_value_tags {
                if key_value_tags.clear.unwrap_or(false) {
                    update = update.remove_all_key_value_tags();
                }
                for key in key_value_tags.remove.unwrap_or_default() {
                    update = update.remove_key_value_tag(key.as_str());
                }
                for pair in key_value_tags.add.unwrap_or_default() {
                    update = update.add_key_value_tag(pair.key.as_str(), pair.value.as_str());
                }
            }

            if let Some(content_descriptors) = self.content_descriptors {
                for descriptor in content_descriptors.remove.unwrap_or_default() {
                    update = update.remove_content_descriptor(descriptor.into());
                }
                for descriptor in content_descriptors.add.unwrap_or_default() {
                    update = update.add_content_descriptor(descriptor.into());
                }
            }

            if let Some(videos) = self.additional_preview_videos {
                for video_id in videos {
                    update = update.add_preview_video(video_id.as_str())?;
                }
            }

            if let Some(content_path) = self.content_path {
                update = update.content_path(Path::new(&content_path));
            }

            if let Some(visibility) = self.visibility {
                update = update.visibility(visibility.into());
            }

            // Only touch the range when the caller set one end: Steam would otherwise open it to every game version.
            if self.required_game_version_min.is_some() || self.required_game_version_max.is_some()
            {
                update = update.required_game_versions(
                    self.required_game_version_min.as_deref(),
                    self.required_game_version_max.as_deref(),
                );
            }

            let change_note = self.change_note.as_deref();
            Ok(update.submit(change_note, callback))
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

    /// Creates an empty Workshop item. The file type defaults to `Community`; `Art` creates an Artwork item.
    ///
    /// @param appId - defaults to the app id the client was initialized with
    /// @param fileType - the Workshop file type; omitted keeps `Community`
    #[napi]
    pub async fn create_item(
        app_id: Option<u32>,
        file_type: Option<WorkshopFileType>,
    ) -> Result<UgcResult, Error> {
        let client = crate::client::get_client();
        let app_id = app_id
            .map(steamworks::AppId)
            .unwrap_or_else(|| client.utils().app_id());

        let (tx, rx) = oneshot::channel();

        client
            .ugc()
            .create_item(app_id, file_type_or_community(file_type), |result| {
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
                required_game_version_min: None,
                required_game_version_max: None,
                additional_preview_videos: None,
                metadata: None,
                key_value_tags: None,
                content_descriptors: None,
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
                required_game_version_min: None,
                required_game_version_max: None,
                additional_preview_videos: None,
                metadata: None,
                key_value_tags: None,
                content_descriptors: None,
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
        update_details.check()?;
        let client = crate::client::get_client();

        let app_id = app_id
            .map(steamworks::AppId)
            .unwrap_or_else(|| client.utils().app_id());

        let (tx, rx) = oneshot::channel();

        {
            let update_handle = client
                .ugc()
                .start_item_update(app_id, PublishedFileId(item_id.get_u64().1));

            update_details
                .submit(update_handle, |result| {
                    send_completion(tx, result);
                })
                .map_err(|e| Error::from_reason(e.to_string()))?;
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
        // A copy for the failures before submission. The original moves into the completion closure.
        let error_before_submit = error_callback.clone();
        if let Err(e) = update_details.check() {
            error_before_submit.call(e, ThreadsafeFunctionCallMode::Blocking);
            return;
        }

        let client = crate::client::get_client();

        let app_id = app_id
            .map(steamworks::AppId)
            .unwrap_or_else(|| client.utils().app_id());

        {
            let update_handle = client
                .ugc()
                .start_item_update(app_id, PublishedFileId(item_id.get_u64().1));

            let update_watch_handle = match update_details.submit(update_handle, move |result| {
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
            }) {
                Ok(handle) => handle,
                Err(e) => {
                    error_before_submit.call(
                        Error::from_reason(e.to_string()),
                        ThreadsafeFunctionCallMode::Blocking,
                    );
                    return;
                }
            };

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

    /// The user's vote on a Workshop item, as Steam reports it.
    #[napi(object)]
    pub struct UserItemVoteState {
        pub voted_up: bool,
        pub voted_down: bool,
        /// The user has neither voted up nor down.
        pub skipped: bool,
    }

    /// The app dependencies of a Workshop item. When `appIds` is shorter than
    /// `totalAppDependencies`, the list is incomplete.
    #[napi(object)]
    pub struct AppDependencies {
        /// Steam result code; `1` is OK.
        pub result: u32,
        pub app_ids: Vec<u32>,
        pub total_app_dependencies: u32,
    }

    /// Votes for (`voteUp` true) or against a Workshop item as the current user.
    ///
    /// **Changes the user's vote on Steam.** Resolves when Steam confirms the vote.
    ///
    /// @param itemId - the Workshop item
    /// @param voteUp - true to vote up, false to vote down
    #[napi]
    pub async fn set_user_item_vote(item_id: BigInt, vote_up: bool) -> Result<(), Error> {
        let item = published_file_id_arg("itemId", &item_id)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client.ugc().set_user_item_vote(item, vote_up, |result| {
            send_completion(tx, result);
        });

        await_completion(rx, "setting the Workshop item vote").await
    }

    /// Reads the current user's vote on a Workshop item. Read-only.
    #[napi]
    pub async fn get_user_item_vote(item_id: BigInt) -> Result<UserItemVoteState, Error> {
        let item = published_file_id_arg("itemId", &item_id)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client.ugc().get_user_item_vote(item, |result| {
            send_completion(tx, result);
        });

        let vote = await_completion(rx, "reading the Workshop item vote").await?;
        Ok(UserItemVoteState {
            voted_up: vote.voted_up,
            voted_down: vote.voted_down,
            skipped: vote.vote_skipped,
        })
    }

    /// Adds a Workshop item to the current user's favorites.
    ///
    /// **Changes the user's favorites on Steam.**
    ///
    /// @param itemId - the Workshop item
    /// @param appId - defaults to the app id the client was initialized with
    #[napi]
    pub async fn add_item_to_favorites(item_id: BigInt, app_id: Option<u32>) -> Result<(), Error> {
        let item = published_file_id_arg("itemId", &item_id)?;
        let client = crate::client::get_client();
        let app_id = app_id
            .map(steamworks::AppId)
            .unwrap_or_else(|| client.utils().app_id());
        let (tx, rx) = oneshot::channel();

        client.ugc().add_item_to_favorites(app_id, item, |result| {
            send_completion(tx, result);
        });

        await_completion(rx, "adding the Workshop item to favorites").await
    }

    /// Removes a Workshop item from the current user's favorites.
    ///
    /// **Changes the user's favorites on Steam.**
    ///
    /// @param itemId - the Workshop item
    /// @param appId - defaults to the app id the client was initialized with
    #[napi]
    pub async fn remove_item_from_favorites(
        item_id: BigInt,
        app_id: Option<u32>,
    ) -> Result<(), Error> {
        let item = published_file_id_arg("itemId", &item_id)?;
        let client = crate::client::get_client();
        let app_id = app_id
            .map(steamworks::AppId)
            .unwrap_or_else(|| client.utils().app_id());
        let (tx, rx) = oneshot::channel();

        client
            .ugc()
            .remove_item_from_favorites(app_id, item, |result| {
                send_completion(tx, result);
            });

        await_completion(rx, "removing the Workshop item from favorites").await
    }

    /// Starts playtime tracking for Workshop items. The list must not be empty.
    ///
    /// **Changes the user's playtime records on Steam.**
    ///
    /// @param itemIds - the Workshop items
    #[napi]
    pub async fn start_playtime_tracking(item_ids: Vec<BigInt>) -> Result<(), Error> {
        let items = published_file_ids_arg(&item_ids)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client.ugc().start_playtime_tracking(&items, |result| {
            send_completion(tx, result);
        });

        await_completion(rx, "starting Workshop playtime tracking").await
    }

    /// Stops playtime tracking for Workshop items. The list must not be empty.
    ///
    /// **Changes the user's playtime records on Steam.**
    ///
    /// @param itemIds - the Workshop items
    #[napi]
    pub async fn stop_playtime_tracking(item_ids: Vec<BigInt>) -> Result<(), Error> {
        let items = published_file_ids_arg(&item_ids)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client.ugc().stop_playtime_tracking(&items, |result| {
            send_completion(tx, result);
        });

        await_completion(rx, "stopping Workshop playtime tracking").await
    }

    /// Adds `appId` as an app dependency of a Workshop item (for example a DLC the item needs).
    /// Resolves with the Steam result code, where `1` is OK. A non-OK code resolves rather than rejects.
    ///
    /// **Changes the item's remote state.**
    #[napi]
    pub async fn add_app_dependency(item_id: BigInt, app_id: u32) -> Result<u32, Error> {
        let item = published_file_id_arg("itemId", &item_id)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client
            .ugc()
            .add_app_dependency(item, steamworks::AppId(app_id), |result| {
                send_completion(tx, result);
            });

        let outcome = await_completion(rx, "adding the Workshop app dependency").await?;
        Ok(outcome.result)
    }

    /// Removes `appId` from the app dependencies of a Workshop item. Resolves with the Steam result code
    /// (`1` is OK), with the same rules as `addAppDependency`.
    ///
    /// **Changes the item's remote state.**
    #[napi]
    pub async fn remove_app_dependency(item_id: BigInt, app_id: u32) -> Result<u32, Error> {
        let item = published_file_id_arg("itemId", &item_id)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client
            .ugc()
            .remove_app_dependency(item, steamworks::AppId(app_id), |result| {
                send_completion(tx, result);
            });

        let outcome = await_completion(rx, "removing the Workshop app dependency").await?;
        Ok(outcome.result)
    }

    /// Reads every app dependency of a Workshop item. Steam sends them in pages; they are collected
    /// until the reported total is reached. Read-only.
    ///
    /// Not verified against a live Steam client: see the paging note in steamworks-rs.
    #[napi]
    pub async fn get_app_dependencies(item_id: BigInt) -> Result<AppDependencies, Error> {
        let item = published_file_id_arg("itemId", &item_id)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();

        client.ugc().get_app_dependencies(item, |result| {
            send_completion(tx, result);
        });

        let outcome = await_completion(rx, "reading the Workshop app dependencies").await?;
        Ok(AppDependencies {
            result: outcome.result,
            app_ids: outcome.app_ids.iter().map(|app| app.0).collect(),
            total_app_dependencies: outcome.total_app_dependencies,
        })
    }

    /// Checks a YouTube video ID: 11 characters from `[A-Za-z0-9_-]`, the rule steamworks-rs applies too.
    pub(crate) fn check_video_id(id: &str) -> Result<(), Error> {
        let well_formed = id.len() == 11
            && id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
        if well_formed {
            Ok(())
        } else {
            Err(Error::new(
                napi::Status::InvalidArg,
                format!(
                    "additionalPreviewVideos entry `{id}` is not an 11-character YouTube video ID"
                ),
            ))
        }
    }

    /// Rejects a string that contains a NUL byte. Steam's C API takes NUL-terminated strings.
    fn check_no_nul(field: &str, text: &str) -> Result<(), Error> {
        if text.contains('\0') {
            Err(Error::new(
                napi::Status::InvalidArg,
                format!("{field} must not contain a NUL character"),
            ))
        } else {
            Ok(())
        }
    }

    /// Reads a non-empty list of Workshop item ids for the playtime calls. Item ID 0 is refused.
    pub(crate) fn published_file_ids_arg(ids: &[BigInt]) -> Result<Vec<PublishedFileId>, Error> {
        if ids.is_empty() {
            return Err(Error::new(
                napi::Status::InvalidArg,
                "itemIds must list at least one Workshop item".to_string(),
            ));
        }
        ids.iter()
            .map(|id| {
                let item = published_file_id_arg("itemIds", id)?;
                if item.0 == 0 {
                    Err(Error::new(
                        napi::Status::InvalidArg,
                        "itemIds must not contain item 0".to_string(),
                    ))
                } else {
                    Ok(item)
                }
            })
            .collect()
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
    use super::workshop::{
        await_completion, check_video_id, file_type_or_community, published_file_id_arg,
        published_file_ids_arg, send_completion, KeyValueTag, KeyValueTagsUpdate, UgcUpdate,
        WorkshopContentDescriptor, WorkshopFileType,
    };
    use napi::bindgen_prelude::BigInt;
    use steamworks::{FileType, PublishedFileId, SteamError};
    use tokio::sync::oneshot;

    fn update_with_nothing_set() -> UgcUpdate {
        UgcUpdate {
            title: None,
            description: None,
            change_note: None,
            preview_path: None,
            additional_preview_paths: None,
            remove_additional_preview_indexes: None,
            content_path: None,
            tags: None,
            visibility: None,
            language: None,
            required_game_version_min: None,
            required_game_version_max: None,
            additional_preview_videos: None,
            metadata: None,
            key_value_tags: None,
            content_descriptors: None,
        }
    }

    #[test]
    fn create_item_without_a_file_type_is_community() {
        assert!(matches!(file_type_or_community(None), FileType::Community));
        assert!(matches!(
            file_type_or_community(Some(WorkshopFileType::Art)),
            FileType::Art
        ));
        assert!(matches!(
            file_type_or_community(Some(WorkshopFileType::IntegratedGuide)),
            FileType::IntegratedGuide
        ));
    }

    #[test]
    fn content_descriptors_keep_the_sdk_numbers() {
        assert_eq!(WorkshopContentDescriptor::NudityOrSexualContent as i32, 1);
        assert_eq!(WorkshopContentDescriptor::AnyMatureContent as i32, 5);
        let sdk: steamworks::sys::EUGCContentDescriptorID =
            steamworks::UGCContentDescriptorID::from(WorkshopContentDescriptor::AnyMatureContent)
                .into();
        assert_eq!(sdk as u32, 5);
    }

    #[test]
    fn video_ids_are_checked_before_submission() {
        assert!(check_video_id("dQw4w9WgXcQ").is_ok());
        assert!(check_video_id("a-b_C9z-0_Q").is_ok());
        let short = check_video_id("dQw4w9WgXc").unwrap_err();
        assert_eq!(short.status, napi::Status::InvalidArg);
        assert!(
            short.reason.contains("dQw4w9WgXc"),
            "reason was: {}",
            short.reason
        );
        assert!(check_video_id("https://youtu.be/dQw4w9WgXcQ").is_err());
        assert!(check_video_id("dQw4w9WgX/Q").is_err());
    }

    #[test]
    fn an_update_with_a_bad_new_field_is_refused_and_names_it() {
        let mut update = update_with_nothing_set();
        update.additional_preview_videos = Some(vec!["dQw4w9WgXcQ".into(), "short".into()]);
        let error = update.check().unwrap_err();
        assert!(
            error.reason.contains("short"),
            "reason was: {}",
            error.reason
        );

        let mut update = update_with_nothing_set();
        update.metadata = Some("v\0".into());
        assert!(update.check().is_err());

        let mut update = update_with_nothing_set();
        update.key_value_tags = Some(KeyValueTagsUpdate {
            clear: None,
            remove: None,
            add: Some(vec![KeyValueTag {
                key: "mode".into(),
                value: "a\0b".into(),
            }]),
        });
        assert!(update.check().is_err());
    }

    #[test]
    fn an_update_that_sets_none_of_the_new_fields_passes_the_check() {
        assert!(update_with_nothing_set().check().is_ok());
    }

    #[test]
    fn playtime_lists_need_at_least_one_valid_item() {
        assert!(published_file_ids_arg(&[]).is_err());
        assert!(published_file_ids_arg(&[BigInt::from(0u64)]).is_err());
        assert_eq!(
            published_file_ids_arg(&[BigInt::from(5u64), BigInt::from(6u64)]).unwrap(),
            vec![PublishedFileId(5), PublishedFileId(6)]
        );
    }

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
