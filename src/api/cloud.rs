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

    #[napi]
    pub fn is_enabled_for_account() -> bool {
        let client = crate::client::get_client();
        client.remote_storage().is_cloud_enabled_for_account()
    }

    #[napi]
    pub fn is_enabled_for_app() -> bool {
        let client = crate::client::get_client();
        client.remote_storage().is_cloud_enabled_for_app()
    }

    #[napi]
    pub fn set_enabled_for_app(enabled: bool) {
        let client = crate::client::get_client();
        client.remote_storage().set_cloud_enabled_for_app(enabled)
    }

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

    #[napi]
    pub fn write_file(name: String, content: String) -> bool {
        let client = crate::client::get_client();
        let file = client.remote_storage().file(&name);

        let buf = content.as_bytes();
        file.write().write_all(buf).is_ok()
    }

    #[napi]
    pub fn delete_file(name: String) -> bool {
        let client = crate::client::get_client();
        let file = client.remote_storage().file(&name);

        file.delete()
    }

    #[napi]
    pub fn file_exists(name: String) -> bool {
        let client = crate::client::get_client();
        let file = client.remote_storage().file(&name);

        file.exists()
    }

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
