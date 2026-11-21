use super::localplayer::PlayerSteamId;
use napi_derive::napi;

#[napi]
pub mod apps {
    use super::PlayerSteamId;
    use napi::bindgen_prelude::Error;
    use steamworks::AppId;

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
}
