use napi_derive::napi;

#[napi]
pub mod overlay {
    use napi::bindgen_prelude::BigInt;
    use std::fmt;
    use steamworks::OverlayToStoreFlag;

    #[napi]
    pub enum Dialog {
        /// Friends list dialog.
        Friends,
        /// Steam Community dialog.
        Community,
        /// Recent players dialog.
        Players,
        /// Steam settings dialog.
        Settings,
        /// Official group of the game.
        OfficialGameGroup,
        /// Game statistics dialog.
        Stats,
        /// Achievements dialog.
        Achievements,
    }

    impl fmt::Display for Dialog {
        fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
            match self {
                Dialog::Friends => write!(f, "friends"),
                Dialog::Community => write!(f, "community"),
                Dialog::Players => write!(f, "players"),
                Dialog::Settings => write!(f, "settings"),
                Dialog::OfficialGameGroup => write!(f, "officialgamegroup"),
                Dialog::Stats => write!(f, "stats"),
                Dialog::Achievements => write!(f, "achievements"),
            }
        }
    }

    #[napi]
    pub enum StoreFlag {
        /// Open the store page without adding the app to the cart.
        None,
        /// Add the app to the cart without showing the cart.
        AddToCart,
        /// Add the app to the cart and show the cart.
        AddToCartAndShow,
    }

    /// Opens a Steam overlay dialog. Unverified against a live Steam client: nothing is shown when the overlay is disabled.
    /// @param dialog - dialog to open
    #[napi]
    pub fn activate_dialog(dialog: Dialog) {
        let client = crate::client::get_client();
        client.friends().activate_game_overlay(&dialog.to_string())
    }

    /// Opens a Steam overlay dialog for a specific user. Unverified against a live Steam client.
    /// @param dialog - dialog to open
    /// @param steamId64 - SteamID64 of the user as a BigInt
    #[napi]
    pub fn activate_dialog_to_user(dialog: Dialog, steam_id64: BigInt) {
        let client = crate::client::get_client();
        client.friends().activate_game_overlay_to_user(
            &dialog.to_string(),
            steamworks::SteamId::from_raw(steam_id64.get_u64().1),
        )
    }

    /// Opens the Steam invite dialog for a lobby.
    /// @param lobbyId - lobby ID as a BigInt
    #[napi]
    pub fn activate_invite_dialog(lobby_id: BigInt) {
        let client = crate::client::get_client();
        client
            .friends()
            .activate_invite_dialog(steamworks::LobbyId::from_raw(lobby_id.get_u64().1))
    }

    /// Opens a web page in the Steam overlay browser. Unverified against a live Steam client.
    /// @param url - absolute URL to open
    #[napi]
    pub fn activate_to_web_page(url: String) {
        let client = crate::client::get_client();
        client.friends().activate_game_overlay_to_web_page(&url)
    }

    /// Opens the Steam store page of an app in the overlay.
    /// @param appId - AppID of the app to show
    /// @param flag - whether to add the app to the cart, and whether to show the cart
    #[napi]
    pub fn activate_to_store(app_id: u32, flag: StoreFlag) {
        let client = crate::client::get_client();
        client.friends().activate_game_overlay_to_store(
            steamworks::AppId(app_id),
            match flag {
                StoreFlag::None => OverlayToStoreFlag::None,
                StoreFlag::AddToCart => OverlayToStoreFlag::AddToCart,
                StoreFlag::AddToCartAndShow => OverlayToStoreFlag::AddToCartAndShow,
            },
        )
    }
}
