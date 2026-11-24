use napi_derive::napi;

#[napi]
pub mod cloud {
    use crate::api::localplayer::u64_from_bigint;
    use crate::api::workshop::workshop::await_completion;
    use napi::bindgen_prelude::{BigInt, Buffer, Error};
    use std::io::Read;
    use std::io::Write;
    use steamworks::{
        FilePathType as SteamFilePathType, LocalFileChangeType as SteamLocalFileChangeType,
        RemoteStoragePlatforms, UgcDetails as SteamUgcDetails, UgcDownload as SteamUgcDownload,
        UgcDownloadProgress as SteamUgcDownloadProgress, UgcReadAction as SteamUgcReadAction,
    };
    use tokio::sync::oneshot;

    #[napi]
    pub struct FileInfo {
        pub name: String,
        pub size: BigInt,
    }

    /// Checks whether Steam Cloud is enabled for the user's account. This is separate from the app setting (`isEnabledForApp()`).
    /// @returns true if enabled for the account, otherwise false.
    #[napi]
    pub fn is_enabled_for_account() -> bool {
        let client = crate::client::get_client();
        client.remote_storage().is_cloud_enabled_for_account()
    }

    /// Checks whether Steam Cloud is enabled for the current app. This is separate from the account setting (`isEnabledForAccount()`).
    /// @returns true if enabled for the app, otherwise false.
    #[napi]
    pub fn is_enabled_for_app() -> bool {
        let client = crate::client::get_client();
        client.remote_storage().is_cloud_enabled_for_app()
    }

    /// Turns Steam Cloud on or off for the current app. It does not change the account setting. Returns nothing, and the binding does not report whether Steam applied the change.
    /// @param enabled - true to enable Steam Cloud for the app, false to disable it.
    #[napi]
    pub fn set_enabled_for_app(enabled: bool) {
        let client = crate::client::get_client();
        client.remote_storage().set_cloud_enabled_for_app(enabled)
    }

    /// Reads a Steam Cloud file as UTF-8 text. Needs `init()`.
    /// Rejects with "Failed to read file" when the file cannot be read or its bytes are not valid UTF-8. Unverified against a live Steam client: a missing file is read as empty text on this code path.
    /// @param name - The cloud file name.
    /// @returns the file content as a string.
    #[napi]
    pub fn read_file(name: String) -> Result<String, Error> {
        let client = crate::client::get_client();
        let mut buf: String = String::new();
        let size = client
            .remote_storage()
            .file(&name)
            .read()
            .read_to_string(&mut buf);

        match size {
            Ok(_) => Ok(buf),
            Err(e) => Err(Error::from_reason(format!("Failed to read file: {}", e))),
        }
    }

    /// Writes text to a Steam Cloud file as UTF-8, replacing its previous content. Needs `init()`.
    /// The write is committed when the write stream closes, which happens before this call returns.
    /// @param name - The cloud file name.
    /// @param content - Text to write, encoded as UTF-8.
    /// @returns true if the content was accepted by the write stream, false if writing failed. The commit result is not reported. Unverified against a live Steam client whether a failed commit is visible.
    #[napi]
    pub fn write_file(name: String, content: String) -> bool {
        let client = crate::client::get_client();
        let file = client.remote_storage().file(&name);

        let buf = content.as_bytes();
        file.write().write_all(buf).is_ok()
    }

    /// Deletes a Steam Cloud file both locally and in the cloud. Needs `init()`.
    /// @param name - The cloud file name.
    /// @returns true if a file was deleted, false if none was.
    #[napi]
    pub fn delete_file(name: String) -> bool {
        let client = crate::client::get_client();
        let file = client.remote_storage().file(&name);

        file.delete()
    }

    /// Checks whether a Steam Cloud file exists. Needs `init()`.
    /// @param name - The cloud file name.
    /// @returns true if the file exists, otherwise false.
    #[napi]
    pub fn file_exists(name: String) -> bool {
        let client = crate::client::get_client();
        let file = client.remote_storage().file(&name);

        file.exists()
    }

    /// Lists the Steam Cloud files of the current app. Needs `init()`.
    /// @returns an array of entries with `name` and `size` fields, where size is the file size in bytes as a BigInt. The array is empty when there are no files.
    #[napi]
    pub fn list_files() -> Vec<FileInfo> {
        let client = crate::client::get_client();
        client
            .remote_storage()
            .files()
            .into_iter()
            .map(|identity| FileInfo {
                name: identity.name,
                size: BigInt::from(identity.size),
            })
            .collect()
    }

    /// The platforms a cloud file syncs to.
    #[napi]
    pub enum SyncPlatform {
        None,
        Windows,
        MacOS,
        Linux,
        /// Every platform the binding knows about.
        All,
    }

    impl From<SyncPlatform> for RemoteStoragePlatforms {
        fn from(platform: SyncPlatform) -> Self {
            match platform {
                SyncPlatform::None => RemoteStoragePlatforms::empty(),
                SyncPlatform::Windows => RemoteStoragePlatforms::WINDOWS,
                SyncPlatform::MacOS => RemoteStoragePlatforms::MACOS,
                SyncPlatform::Linux => RemoteStoragePlatforms::LINUX,
                SyncPlatform::All => RemoteStoragePlatforms::all(),
            }
        }
    }

    fn check_name(name: &str) -> Result<(), Error> {
        if name.contains('\0') {
            return Err(Error::from_reason(
                "file name must not contain a NUL character",
            ));
        }
        Ok(())
    }

    /// Shares a cloud file so others can link to it. Resolves with the share handle.
    /// Resolution needs `runCallbacks()`, which `init()` already calls.
    #[napi]
    pub async fn share_file(name: String) -> Result<BigInt, Error> {
        check_name(&name)?;
        let (tx, rx) = oneshot::channel();
        crate::client::get_client()
            .remote_storage()
            .file(&name)
            .share(move |result| {
                let _ = tx.send(result);
            });
        let handle = rx
            .await
            .map_err(|_| {
                Error::from_reason(
                    "the result of sharing the file was not received; the outcome is unknown",
                )
            })?
            .map_err(|error| Error::from_reason(error.to_string()))?;
        Ok(BigInt::from(handle))
    }

    /// Stops syncing a cloud file. The Steam copy stays, and the local copy is no longer synced.
    /// @returns true on success
    #[napi]
    pub fn forget_file(name: String) -> bool {
        if check_name(&name).is_err() {
            return false;
        }
        let client = crate::client::get_client();
        client.remote_storage().file(&name).forget()
    }

    /// @returns the platform a cloud file syncs to. Rejects when the file syncs to a combination of platforms.
    #[napi]
    pub fn get_sync_platforms(name: String) -> Result<SyncPlatform, Error> {
        check_name(&name)?;
        let client = crate::client::get_client();
        let platforms = client.remote_storage().file(&name).get_sync_platforms();
        if platforms.is_empty() {
            Ok(SyncPlatform::None)
        } else if platforms == RemoteStoragePlatforms::all() {
            Ok(SyncPlatform::All)
        } else if platforms == RemoteStoragePlatforms::WINDOWS {
            Ok(SyncPlatform::Windows)
        } else if platforms == RemoteStoragePlatforms::MACOS {
            Ok(SyncPlatform::MacOS)
        } else if platforms == RemoteStoragePlatforms::LINUX {
            Ok(SyncPlatform::Linux)
        } else {
            Err(Error::from_reason(format!(
                "{name} syncs to a combination of platforms, which this binding cannot represent"
            )))
        }
    }

    /// Sets the platform a cloud file syncs to.
    #[napi]
    pub fn set_sync_platforms(name: String, platform: SyncPlatform) -> Result<(), Error> {
        check_name(&name)?;
        let client = crate::client::get_client();
        client
            .remote_storage()
            .file(&name)
            .set_sync_platforms(platform.into());
        Ok(())
    }

    /// The Steam Cloud quota, in bytes.
    #[napi(object)]
    pub struct CloudQuota {
        /// The total quota.
        pub total: BigInt,
        /// The part of the quota that is still available.
        pub available: BigInt,
    }

    /// Returns the Steam Cloud quota in bytes. Needs `init()`. The SDK header does not say whether the quota is per account or per app; unverified against a live Steam client.
    /// @returns `total` and `available` as BigInts, or `null` when Steam reports no quota.
    #[napi]
    pub fn get_quota() -> Option<CloudQuota> {
        let client = crate::client::get_client();
        client.remote_storage().quota().map(|quota| CloudQuota {
            total: BigInt::from(quota.total_bytes),
            available: BigInt::from(quota.available_bytes),
        })
    }

    /// Replaces the content of a Steam Cloud file with `content`, asynchronously. Needs `init()`. This sends data to Steam.
    /// Resolves once Steam has stored the file. The result is delivered through `runCallbacks()`, which `init()` already calls.
    /// Rejects when the name contains a NUL character or the content is larger than 4 GB (nothing is sent), or when Steam reports an error. There is no timeout: if Steam never answers, the Promise stays pending and the outcome is unknown.
    /// The header caps a file at 200 MB and a single chunk at 100 MB; Steam enforces those limits.
    /// @param name - The cloud file name.
    /// @param content - The bytes to store.
    #[napi]
    pub async fn write_file_async(name: String, content: Buffer) -> Result<(), Error> {
        check_name(&name)?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client
            .remote_storage()
            .write_file_async(&name, content.to_vec(), move |result| {
                let _ = tx.send(result);
            })
            .map_err(|_| Error::from_reason("the content is larger than 4 GB"))?;
        await_completion(rx, "writing the Steam Cloud file").await
    }

    /// An open Steam Cloud write stream, from `openWriteStream()`. Write chunks, then call `close()` to commit them or `cancel()` to discard them.
    /// If the object is garbage-collected without either call, the SDK closes the stream on drop, which commits the chunks written so far.
    #[napi]
    pub struct FileWriteStream {
        writer: Option<steamworks::SteamFileWriter>,
    }

    #[napi]
    impl FileWriteStream {
        /// Writes one chunk to the stream. Nothing changes in the cloud file until `close()`. The header caps a chunk at 100 MB.
        /// @param data - The bytes of this chunk.
        /// @returns true if Steam accepted the chunk; false if the stream is already closed or Steam refused the chunk.
        #[napi]
        pub fn write_chunk(&mut self, data: Buffer) -> bool {
            self.writer
                .as_mut()
                .is_some_and(|writer| writer.write_chunk(&data))
        }

        /// Commits the chunks written so far, so they become the file's content. The stream cannot be used afterwards.
        /// @returns true if Steam accepted the commit; false if the stream was already closed or Steam refused the close.
        #[napi]
        pub fn close(&mut self) -> bool {
            self.writer.take().is_some_and(|writer| writer.close())
        }

        /// Discards the chunks without committing them. The stream cannot be used afterwards. The effect on the existing file is unverified against a live Steam client.
        /// @returns true if Steam accepted the cancel; false if the stream was already closed or Steam refused it.
        #[napi]
        pub fn cancel(&mut self) -> bool {
            self.writer.take().is_some_and(|writer| writer.cancel())
        }
    }

    /// Opens a Steam Cloud write stream on a file, for writing content in chunks. Needs `init()`. The file changes only when `close()` commits the stream.
    /// Throws when the name contains a NUL character, or when Steam does not open the stream.
    /// @param name - The cloud file name.
    /// @returns the open stream.
    #[napi]
    pub fn open_write_stream(name: String) -> Result<FileWriteStream, Error> {
        check_name(&name)?;
        let client = crate::client::get_client();
        let writer = client.remote_storage().file(&name).write();
        if !writer.is_open() {
            return Err(Error::from_reason(format!(
                "Steam did not open a write stream for {name}"
            )));
        }
        Ok(FileWriteStream {
            writer: Some(writer),
        })
    }

    /// Starts a batch of cloud file writes, so that several file changes count as one, for example the two files of one save. Pair it with `endFileWriteBatch()`. Needs `init()`.
    /// @returns the SDK's result.
    #[napi]
    pub fn begin_file_write_batch() -> bool {
        crate::client::get_client()
            .remote_storage()
            .begin_file_write_batch()
    }

    /// Ends a batch started with `beginFileWriteBatch()`. Needs `init()`.
    /// @returns the SDK's result.
    #[napi]
    pub fn end_file_write_batch() -> bool {
        crate::client::get_client()
            .remote_storage()
            .end_file_write_batch()
    }

    /// What happened to a cloud file that changed on another device, from Steam's `ERemoteStorageLocalFileChange`.
    #[napi]
    pub enum LocalFileChangeType {
        /// The SDK reports no change.
        Invalid = 0,
        /// The file was updated from another device.
        FileUpdated = 1,
        /// The file was deleted by another device.
        FileDeleted = 2,
        /// A value this binding does not name.
        Unknown = -1,
    }

    impl From<SteamLocalFileChangeType> for LocalFileChangeType {
        fn from(change: SteamLocalFileChangeType) -> Self {
            match change {
                SteamLocalFileChangeType::Invalid => LocalFileChangeType::Invalid,
                SteamLocalFileChangeType::FileUpdated => LocalFileChangeType::FileUpdated,
                SteamLocalFileChangeType::FileDeleted => LocalFileChangeType::FileDeleted,
                SteamLocalFileChangeType::Unknown => LocalFileChangeType::Unknown,
            }
        }
    }

    /// How the path of a changed cloud file is given, from Steam's `ERemoteStorageFilePathType`.
    #[napi]
    pub enum FilePathType {
        /// The SDK reports no path type.
        Invalid = 0,
        /// The game reads the file directly, and the path is the full path.
        Absolute = 1,
        /// The file is accessed through the Steam Cloud API, and the path is the file name.
        ApiFilename = 2,
        /// A value this binding does not name.
        Unknown = -1,
    }

    impl From<SteamFilePathType> for FilePathType {
        fn from(path_type: SteamFilePathType) -> Self {
            match path_type {
                SteamFilePathType::Invalid => FilePathType::Invalid,
                SteamFilePathType::Absolute => FilePathType::Absolute,
                SteamFilePathType::ApiFilename => FilePathType::ApiFilename,
                SteamFilePathType::Unknown => FilePathType::Unknown,
            }
        }
    }

    /// A cloud file that changed on another device, from `getLocalFileChanges()`.
    #[napi(object)]
    pub struct LocalFileChange {
        /// The path or file name, as the SDK gives it.
        pub path: String,
        /// What happened to the file.
        pub change_type: LocalFileChangeType,
        /// How `path` is given.
        pub path_type: FilePathType,
    }

    /// Returns the cloud files that changed on another device since the last call. Needs `init()`.
    /// Entries for which the SDK returns no path are skipped.
    /// @returns an array of entries with `path`, `changeType` and `pathType`; empty when nothing changed.
    #[napi]
    pub fn get_local_file_changes() -> Vec<LocalFileChange> {
        crate::client::get_client()
            .remote_storage()
            .local_file_changes()
            .into_iter()
            .map(|change| LocalFileChange {
                path: change.path,
                change_type: change.change_type.into(),
                path_type: change.path_type.into(),
            })
            .collect()
    }

    /// The result of a UGC download, from `downloadUgc()` and `downloadUgcToLocation()`.
    #[napi(object)]
    pub struct UgcDownloadResult {
        /// The handle of the downloaded file.
        pub handle: BigInt,
        /// The app that created the file.
        pub app_id: u32,
        /// The size of the downloaded file in bytes.
        pub size_in_bytes: i32,
        /// The file name the creator gave it.
        pub file_name: String,
        /// The SteamID of the user who created the content.
        pub owner: BigInt,
    }

    impl From<SteamUgcDownload> for UgcDownloadResult {
        fn from(download: SteamUgcDownload) -> Self {
            Self {
                handle: BigInt::from(download.handle),
                app_id: download.app_id.0,
                size_in_bytes: download.size_in_bytes,
                file_name: download.file_name,
                owner: BigInt::from(download.owner.raw()),
            }
        }
    }

    /// Downloads a user-generated content (UGC) file, such as a Workshop file, by its handle. Needs `init()`. This starts network transfers.
    /// Resolves with the file's details once the download completes; `runCallbacks()`, which `init()` already calls, drives the result.
    /// Rejects when `handle` is not a non-negative BigInt below 2^64, or when Steam reports an error. There is no timeout: if Steam never answers, the Promise stays pending and the outcome is unknown.
    /// @param handle - The UGC handle as a BigInt.
    /// @param priority - 0 downloads at once. A higher value waits until downloads with lower values finish; equal values download together (from the SDK header).
    /// @returns the file's handle, app id, size, file name and owner.
    #[napi]
    pub async fn download_ugc(handle: BigInt, priority: u32) -> Result<UgcDownloadResult, Error> {
        let handle = u64_from_bigint(handle, "handle")?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client
            .remote_storage()
            .ugc_download(handle, priority, move |result| {
                let _ = tx.send(result);
            });
        let download = await_completion(rx, "downloading the UGC file").await?;
        Ok(download.into())
    }

    /// Downloads a UGC file like `downloadUgc()`, but to the path `location`. Needs `init()`. This starts network transfers.
    /// The header gives no detail on the location format, so the result of a custom location is unverified against a live Steam client.
    /// Rejects when `handle` is invalid, when `location` contains a NUL character (nothing is downloaded), or when Steam reports an error. There is no timeout: if Steam never answers, the Promise stays pending.
    /// @param handle - The UGC handle as a BigInt.
    /// @param location - The path to write the file to.
    /// @param priority - 0 downloads at once; see `downloadUgc()`.
    /// @returns the file's handle, app id, size, file name and owner.
    #[napi]
    pub async fn download_ugc_to_location(
        handle: BigInt,
        location: String,
        priority: u32,
    ) -> Result<UgcDownloadResult, Error> {
        let handle = u64_from_bigint(handle, "handle")?;
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client
            .remote_storage()
            .ugc_download_to_location(handle, &location, priority, move |result| {
                let _ = tx.send(result);
            })
            .map_err(|_| Error::from_reason("location must not contain a NUL character"))?;
        let download = await_completion(rx, "downloading the UGC file to a location").await?;
        Ok(download.into())
    }

    /// Progress of a UGC download, from `getUgcDownloadProgress()`.
    #[napi(object)]
    pub struct UgcDownloadProgress {
        /// The number of bytes downloaded so far.
        pub bytes_downloaded: i32,
        /// The number of bytes expected. It can be `0` before the transfer starts, so check it before dividing.
        pub bytes_expected: i32,
    }

    impl From<SteamUgcDownloadProgress> for UgcDownloadProgress {
        fn from(progress: SteamUgcDownloadProgress) -> Self {
            Self {
                bytes_downloaded: progress.bytes_downloaded,
                bytes_expected: progress.bytes_expected,
            }
        }
    }

    /// Returns how far a UGC download has progressed. Needs `init()`.
    /// @param handle - The UGC handle as a BigInt.
    /// @returns the byte counts, or `null` when Steam reports no progress for the handle.
    #[napi]
    pub fn get_ugc_download_progress(handle: BigInt) -> Result<Option<UgcDownloadProgress>, Error> {
        let handle = u64_from_bigint(handle, "handle")?;
        Ok(crate::client::get_client()
            .remote_storage()
            .ugc_download_progress(handle)
            .map(UgcDownloadProgress::from))
    }

    /// Metadata of a downloaded UGC file, from `getUgcDetails()`.
    #[napi(object)]
    pub struct UgcDetails {
        /// The app that created the file.
        pub app_id: u32,
        /// The file name the creator gave it. Empty when Steam returns no name.
        pub file_name: String,
        /// The size of the file in bytes.
        pub size_in_bytes: i32,
        /// The SteamID of the user who created the content.
        pub owner: BigInt,
    }

    impl From<SteamUgcDetails> for UgcDetails {
        fn from(details: SteamUgcDetails) -> Self {
            Self {
                app_id: details.app_id.0,
                file_name: details.file_name,
                size_in_bytes: details.size_in_bytes,
                owner: BigInt::from(details.owner.raw()),
            }
        }
    }

    /// Returns the metadata of a downloaded UGC file, the same as in the download result. Needs `init()`.
    /// @param handle - The UGC handle as a BigInt.
    /// @returns the metadata, or `null` when Steam reports no details.
    #[napi]
    pub fn get_ugc_details(handle: BigInt) -> Result<Option<UgcDetails>, Error> {
        let handle = u64_from_bigint(handle, "handle")?;
        Ok(crate::client::get_client()
            .remote_storage()
            .ugc_details(handle)
            .map(UgcDetails::from))
    }

    /// How `readUgc()` treats the file handle after a read, from Steam's `EUGCReadAction`.
    #[napi]
    pub enum UgcReadAction {
        /// Keeps the handle open until the last byte is read, then closes it. Use it for sequential reads.
        ContinueReadingUntilFinished = 0,
        /// Keeps the handle open, so the file can be read at several offsets. Finish with `Close`.
        ContinueReading = 1,
        /// Frees the handle. Read the file again only after another download.
        Close = 2,
    }

    impl From<UgcReadAction> for SteamUgcReadAction {
        fn from(action: UgcReadAction) -> Self {
            match action {
                UgcReadAction::ContinueReadingUntilFinished => {
                    SteamUgcReadAction::ContinueReadingUntilFinished
                }
                UgcReadAction::ContinueReading => SteamUgcReadAction::ContinueReading,
                UgcReadAction::Close => SteamUgcReadAction::Close,
            }
        }
    }

    /// Reads part of a downloaded UGC file into `buffer`, starting at `offset`. Needs `init()`.
    /// The read length is the length of `buffer`, and the bytes are written into it in place. Files over 100 MB must be read in chunks (from the SDK header). `offset` is an unsigned 32-bit value, as in the SDK.
    /// @param handle - The UGC handle as a BigInt.
    /// @param buffer - The Buffer that receives the bytes. Its length is the read length.
    /// @param offset - The byte offset to start reading at.
    /// @param action - How the handle is treated after the read.
    /// @returns the number of bytes read. `null` when Steam reports a negative count or the buffer is longer than 2^31 - 1 bytes; the SDK header does not define the failure value, so the `null` case is unverified.
    #[napi]
    pub fn read_ugc(
        handle: BigInt,
        mut buffer: Buffer,
        offset: u32,
        action: UgcReadAction,
    ) -> Result<Option<u32>, Error> {
        let handle = u64_from_bigint(handle, "handle")?;
        Ok(crate::client::get_client()
            .remote_storage()
            .ugc_read(handle, &mut buffer, offset, action.into())
            .map(|read| read as u32))
    }

    /// Returns how many downloaded UGC files are waiting to be read with `readUgc()`. Needs `init()`.
    /// @returns the count.
    #[napi]
    pub fn get_cached_ugc_count() -> i32 {
        crate::client::get_client()
            .remote_storage()
            .cached_ugc_count()
    }

    /// Returns the handle of a downloaded UGC file that is waiting to be read. Needs `init()`.
    /// @param index - The index, from 0 to the count minus one.
    /// @returns the handle as a BigInt, or `null` when Steam returns the invalid handle.
    #[napi]
    pub fn get_cached_ugc_handle(index: i32) -> Option<BigInt> {
        crate::client::get_client()
            .remote_storage()
            .cached_ugc_handle(index)
            .map(BigInt::from)
    }
}
