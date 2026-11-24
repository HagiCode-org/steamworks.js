use super::localplayer::PlayerSteamId;
use napi_derive::napi;

#[napi]
pub mod apps {
    use super::PlayerSteamId;
    use crate::api::workshop::workshop::await_completion;
    use napi::bindgen_prelude::{BigInt, Error};
    use steamworks::AppId;
    use tokio::sync::oneshot;

    /// The metadata of one DLC, as listed by `getDlcs()`.
    #[napi(object)]
    pub struct DlcInfo {
        /// The DLC's Steam app ID.
        pub app_id: u32,
        /// Steam's `available` flag for the DLC. The SDK header does not define it any further (unverified against a live Steam client).
        pub available: bool,
        /// The DLC name as Steam reports it.
        pub name: String,
    }

    /// The bytes of an optional DLC, as returned by `getDlcDownloadProgress()`.
    #[napi(object)]
    pub struct DlcDownloadProgress {
        /// The bytes downloaded so far.
        pub bytes_downloaded: BigInt,
        /// The total bytes to download.
        pub bytes_total: BigInt,
    }

    /// The size, SHA-1 hash and flags of a file, as returned by `getFileDetails()`.
    #[napi(object)]
    pub struct FileDetails {
        /// The original file size in bytes.
        pub size: BigInt,
        /// The SHA-1 hash of the original file, as 40 lowercase hexadecimal characters.
        pub sha1: String,
        /// The flags as Steam reports them. The SDK header does not define them (unverified against a live Steam client).
        pub flags: u32,
    }

    /// The time limits of a timed trial, as returned by `getTimedTrial()`.
    #[napi(object)]
    pub struct TimedTrial {
        /// The playtime allowed, in seconds.
        pub seconds_allowed: u32,
        /// The playtime used so far, in seconds.
        pub seconds_played: u32,
    }

    /// A beta branch of the app, as listed by `getBetas()`.
    #[napi(object)]
    pub struct BetaBranch {
        /// The branch name, for example `public` for the default branch.
        pub name: String,
        /// The branch description as Steam reports it.
        pub description: String,
        /// The build ID the branch currently has.
        pub build_id: u32,
        /// The raw `EBetaBranchFlags` bit set: 1 default, 2 available, 4 private, 8 selected, 16 installed.
        pub flags: u32,
        /// `true` for the default `public` branch.
        pub is_default: bool,
        /// `true` when the user can select the branch.
        pub is_available: bool,
        /// `true` when the branch is password protected.
        pub is_private: bool,
        /// `true` when the branch is the one selected for the user.
        pub is_selected: bool,
        /// `true` when the branch is the one installed.
        pub is_installed: bool,
    }

    /// Checks whether the user is subscribed to another app, such as a demo or a related game. Per the SDK docs, use it for ownership of an app related to yours, not as a general ownership check.
    /// @param appId - The Steam app ID to check.
    /// @returns true if the user is subscribed to the app, otherwise false.
    #[napi]
    pub fn is_subscribed_app(app_id: u32) -> bool {
        let client = crate::client::get_client();
        client.apps().is_subscribed_app(AppId(app_id))
    }
    /// Checks whether the app is installed for the current user. An installed app does not mean the user owns it.
    /// @param appId - The Steam app ID to check.
    /// @returns true if the app is currently installed, otherwise false.
    #[napi]
    pub fn is_app_installed(app_id: u32) -> bool {
        let client = crate::client::get_client();
        client.apps().is_app_installed(AppId(app_id))
    }

    /// Checks whether the user owns the DLC and has it installed.
    /// @param appId - The Steam app ID of the DLC.
    /// @returns true if the DLC is owned and installed, otherwise false.
    #[napi]
    pub fn is_dlc_installed(app_id: u32) -> bool {
        let client = crate::client::get_client();
        client.apps().is_dlc_installed(AppId(app_id))
    }

    /// Checks whether the user is subscribed through a free weekend.
    /// @returns true if so, otherwise false.
    #[napi]
    pub fn is_subscribed_from_free_weekend() -> bool {
        let client = crate::client::get_client();
        client.apps().is_subscribed_from_free_weekend()
    }

    /// Checks whether the user's account has a VAC ban.
    /// @returns true if the account is VAC banned, otherwise false.
    #[napi]
    pub fn is_vac_banned() -> bool {
        let client = crate::client::get_client();
        client.apps().is_vac_banned()
    }

    /// Checks whether the license for the current app is a cyber cafe license.
    /// @returns true if it is, otherwise false.
    #[napi]
    pub fn is_cybercafe() -> bool {
        let client = crate::client::get_client();
        client.apps().is_cybercafe()
    }

    /// Checks whether the license for the current app provides low violence depots.
    /// @returns true if it does, otherwise false.
    #[napi]
    pub fn is_low_violence() -> bool {
        let client = crate::client::get_client();
        client.apps().is_low_violence()
    }

    /// Checks whether the user is subscribed to the current app.
    /// @returns true if subscribed, otherwise false.
    #[napi]
    pub fn is_subscribed() -> bool {
        let client = crate::client::get_client();
        client.apps().is_subscribed()
    }

    /// Returns the build ID of the current app as Steam reports it.
    /// @returns the build ID as a signed 32-bit integer.
    #[napi]
    pub fn app_build_id() -> i32 {
        let client = crate::client::get_client();
        client.apps().app_build_id()
    }

    /// Returns the install folder of an app. Works even when the app is not installed, returning the folder it would use in the default location.
    /// @param appId - The Steam app ID to look up.
    /// @returns the install folder path.
    #[napi]
    pub fn app_install_dir(app_id: u32) -> String {
        let client = crate::client::get_client();
        client.apps().app_install_dir(AppId(app_id))
    }

    /// Returns the original owner of the current app. It differs from the current user only when the app is borrowed.
    /// @returns the owner as a PlayerSteamId with `steamId64`, `steamId32` and `accountId` fields.
    #[napi]
    pub fn app_owner() -> PlayerSteamId {
        let client = crate::client::get_client();
        let steam_id = client.apps().app_owner();
        PlayerSteamId::from_steamid(steam_id)
    }

    /// Returns the languages the current app supports.
    /// @returns the language names as Steam reports them, or an empty array when none are listed.
    #[napi]
    pub fn available_game_languages() -> Vec<String> {
        let client = crate::client::get_client();
        client.apps().available_game_languages()
    }

    /// Returns the language the user has set for the current game. If the user has not set one, Steam returns the language of the Steam UI.
    /// @returns the language name as Steam reports it.
    #[napi]
    pub fn current_game_language() -> String {
        let client = crate::client::get_client();
        client.apps().current_game_language()
    }

    /// Returns the beta branch the user is on for the current app.
    /// @returns the beta branch name, or `null` when the user is on the default branch.
    #[napi]
    pub fn current_beta_name() -> Option<String> {
        let client = crate::client::get_client();
        client.apps().current_beta_name()
    }

    /// @returns the command line the game was launched with, or an empty string
    #[napi]
    pub fn launch_command_line() -> String {
        let client = crate::client::get_client();
        client.apps().launch_command_line()
    }

    /// @returns the value of a query parameter from the Steam launch link, or an empty string when there is none
    #[napi]
    pub fn launch_query_param(key: String) -> Result<String, Error> {
        if key.contains('\0') {
            return Err(Error::from_reason("key must not contain a NUL character"));
        }
        let client = crate::client::get_client();
        Ok(client.apps().launch_query_param(&key))
    }

    /// Returns the Unix time (seconds since 1970-01-01 UTC) of the user's earliest purchase of the app. The SDK header does not say what is returned when the user has no purchase; unverified against a live Steam client.
    /// @param appId - the Steam app ID to look up
    /// @returns the Unix time, as an unsigned 32-bit integer
    #[napi]
    pub fn get_earliest_purchase_unix_time(app_id: u32) -> u32 {
        let client = crate::client::get_client();
        client.apps().earliest_purchase_unix_time(AppId(app_id))
    }

    /// Lists the DLC of the running app. Entries that the SDK does not return are left out, so the list can be shorter than the DLC count. Needs `init()`.
    /// @returns each DLC's app ID, availability flag and name, in the SDK's order
    #[napi]
    pub fn get_dlcs() -> Vec<DlcInfo> {
        let client = crate::client::get_client();
        let apps = client.apps();
        (0..apps.dlc_count())
            .filter_map(|index| apps.dlc_data_by_index(index))
            .map(|dlc| DlcInfo {
                app_id: dlc.app_id.0,
                available: dlc.available,
                name: dlc.name,
            })
            .collect()
    }

    /// Starts installing an optional DLC. This changes the local installation: Steam starts downloading the DLC. Follow the progress with `getDlcDownloadProgress()`.
    /// @param appId - the DLC's Steam app ID
    #[napi]
    pub fn install_dlc(app_id: u32) {
        let client = crate::client::get_client();
        client.apps().install_dlc(AppId(app_id));
    }

    /// Uninstalls an optional DLC. This changes the local installation of the DLC. It does not change ownership.
    /// @param appId - the DLC's Steam app ID
    #[napi]
    pub fn uninstall_dlc(app_id: u32) {
        let client = crate::client::get_client();
        client.apps().uninstall_dlc(AppId(app_id));
    }

    /// Tells Steam that the game files seem corrupt or missing. This changes the local installation: Steam acts on the report. What Steam then does is unverified against a live Steam client.
    /// @param missingFilesOnly - `true` to report only the missing files
    /// @returns the SDK's result as it is
    #[napi]
    pub fn mark_content_corrupt(missing_files_only: bool) -> bool {
        let client = crate::client::get_client();
        client.apps().mark_content_corrupt(missing_files_only)
    }

    /// Returns the depot IDs installed for the app, in mount order. At most 256 depots are read.
    /// @param appId - the Steam app ID
    /// @returns the depot IDs, or an empty array when none are reported
    #[napi]
    pub fn get_installed_depots(app_id: u32) -> Vec<u32> {
        let client = crate::client::get_client();
        client.apps().installed_depots(AppId(app_id))
    }

    /// Returns the bytes downloaded and the total bytes of an optional DLC that is being installed.
    /// @param appId - the DLC's Steam app ID
    /// @returns the progress, or `null` when Steam reports none for the app
    #[napi]
    pub fn get_dlc_download_progress(app_id: u32) -> Option<DlcDownloadProgress> {
        let client = crate::client::get_client();
        client
            .apps()
            .dlc_download_progress(AppId(app_id))
            .map(|progress| DlcDownloadProgress {
                bytes_downloaded: BigInt::from(progress.bytes_downloaded),
                bytes_total: BigInt::from(progress.bytes_total),
            })
    }

    /// Reads the size, SHA-1 hash and flags of a file of the app. The request is answered while `runCallbacks()` runs. Needs `init()`.
    /// @param fileName - the file name to look up; a name with a NUL character is rejected
    /// @returns the file details; rejects when Steam reports an error or the answer is lost
    #[napi]
    pub async fn get_file_details(file_name: String) -> Result<FileDetails, Error> {
        if file_name.contains('\0') {
            return Err(Error::from_reason(
                "fileName must not contain a NUL character",
            ));
        }
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client.apps().file_details(&file_name, |result| {
            let _ = tx.send(result);
        });
        let details = await_completion(rx, "reading the file details").await?;
        Ok(FileDetails {
            size: BigInt::from(details.size),
            sha1: details
                .sha1
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect(),
            flags: details.flags,
        })
    }

    /// @returns `true` when the user has the app through Family Sharing. Then `appOwner()` returns the lender, otherwise `false`
    #[napi]
    pub fn is_subscribed_from_family_sharing() -> bool {
        let client = crate::client::get_client();
        client.apps().is_subscribed_from_family_sharing()
    }

    /// Returns the time limits of the running app's timed trial. Needs `init()`.
    /// @returns the limits, or `null` when the app is not a timed trial
    #[napi]
    pub fn get_timed_trial() -> Option<TimedTrial> {
        let client = crate::client::get_client();
        client.apps().timed_trial().map(|trial| TimedTrial {
            seconds_allowed: trial.seconds_allowed,
            seconds_played: trial.seconds_played,
        })
    }

    /// Tells Steam which DLC the user is playing, or none. Steam uses it to track the use of major DLC. Needs `init()`.
    /// @param appId - the DLC's Steam app ID, or `0` for none
    /// @returns the SDK's result as it is
    #[napi]
    pub fn set_dlc_context(app_id: u32) -> bool {
        let client = crate::client::get_client();
        client.apps().set_dlc_context(AppId(app_id))
    }

    /// Lists every beta branch of the app, including the default `public` branch. Needs `init()`.
    /// @returns the branches in the SDK's order; the array is empty when Steam reports none
    #[napi]
    pub fn get_betas() -> Vec<BetaBranch> {
        let client = crate::client::get_client();
        let apps = client.apps();
        let total = apps.beta_counts().total;
        (0..total)
            .filter_map(|index| apps.beta_info(index))
            .map(|beta| BetaBranch {
                name: beta.name,
                description: beta.description,
                build_id: beta.build_id,
                flags: beta.flags,
                is_default: beta.flags & 1 != 0,
                is_available: beta.flags & 2 != 0,
                is_private: beta.flags & 4 != 0,
                is_selected: beta.flags & 8 != 0,
                is_installed: beta.flags & 16 != 0,
            })
            .collect()
    }

    /// Selects a beta branch of the app; pass `public` to return to the default branch. This changes the local installation: Steam may need the game to restart before it updates to the new branch. Needs `init()`.
    /// @param name - the branch name, as `getBetas()` lists it
    /// @returns `true` when Steam accepted the branch, otherwise `false` (for example a name with a NUL character, or a name Steam refuses)
    #[napi]
    pub fn set_active_beta(name: String) -> bool {
        let client = crate::client::get_client();
        client.apps().set_active_beta(&name).is_ok()
    }

    /// Requests the legacy proof-of-purchase (CD) key of the app or one of its DLC. The key arrives later in an `AppProofOfPurchaseKeyResponse` callback, which `callback.register` receives while `runCallbacks()` runs. The key is a secret: do not log it.
    /// @param appId - the Steam app ID of the app or DLC
    #[napi]
    pub fn request_proof_of_purchase_key(app_id: u32) {
        let client = crate::client::get_client();
        client.apps().request_proof_of_purchase_key(AppId(app_id));
    }

    /// Requests every proof-of-purchase key of the app and its DLC. One `AppProofOfPurchaseKeyResponse` callback arrives per key, then a final one with `appId` `0` and an empty key. The keys are secrets: do not log them.
    #[napi]
    pub fn request_all_proof_of_purchase_keys() {
        let client = crate::client::get_client();
        client.apps().request_all_proof_of_purchase_keys();
    }
}
