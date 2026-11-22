use napi_derive::napi;

#[napi]
pub mod cloud {
    use napi::bindgen_prelude::{BigInt, Error};
    use std::io::Read;
    use std::io::Write;
    use steamworks::RemoteStoragePlatforms;
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
}
