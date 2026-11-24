use napi_derive::napi;

#[napi]
pub mod utils {
    use crate::api::workshop::workshop::await_completion;
    use napi::bindgen_prelude::{BigInt, Error};
    use steamworks::FloatingGamepadTextInputMode as kFloatingGamepadTextInputMode;
    use steamworks::GamepadTextInputLineMode as kGamepadTextInputLineMode;
    use steamworks::GamepadTextInputMode as kGamepadTextInputMode;
    use tokio::sync::oneshot;

    /// The Steam universe a client connects to. The numbers match `EUniverse`.
    #[napi]
    pub enum Universe {
        /// Not set.
        Invalid = 0,
        /// The public Steam universe.
        Public = 1,
        /// The beta universe.
        Beta = 2,
        /// The internal Valve universe.
        Internal = 3,
        /// The development universe.
        Dev = 4,
    }

    /// The verdict of `checkFileSignature`. The numbers match `ECheckFileSignature`.
    #[napi]
    pub enum FileSignatureStatus {
        /// The file is not signed, or the signature does not match.
        InvalidSignature = 0,
        /// The file is signed and the signature is valid.
        ValidSignature = 1,
        /// The file does not exist on disk.
        FileNotFound = 2,
        /// The app has no signing set on the partner site.
        NoSignaturesFoundForThisApp = 3,
        /// The file is not listed in the signing set on the partner site.
        NoSignaturesFoundForThisFile = 4,
    }

    /// The protocol to test with `getIpv6ConnectivityState`. The numbers match `ESteamIPv6ConnectivityProtocol`.
    #[napi]
    pub enum Ipv6Protocol {
        /// HTTP, which can differ from the other protocols when a proxy is in use.
        Http = 1,
        /// UDP on a port Steam also uses. If UDP works, TCP probably works too.
        Udp = 2,
    }

    /// IPv6 connectivity state of this machine. The numbers match `ESteamIPv6ConnectivityState`.
    #[napi]
    pub enum Ipv6ConnectivityState {
        /// No test has run yet.
        Unknown = 0,
        /// A recent IPv6 request succeeded.
        Good = 1,
        /// A request failed: no IPv6 address, or no upstream connectivity.
        Bad = 2,
    }

    /// The kind of text given to `filterText`. The numbers match `ETextFilteringContext`.
    #[napi]
    pub enum TextFilteringContext {
        /// Unknown context.
        Unknown = 0,
        /// Game content: only the legally required filtering is applied.
        GameContent = 1,
        /// Chat from another player.
        Chat = 2,
        /// A character or item name.
        Name = 3,
    }

    /// The output of `filterText`.
    #[napi(object)]
    pub struct FilteredText {
        /// The filtered message, as UTF-8.
        pub text: String,
        /// The number of characters the filter changed, as the SDK reports it.
        pub filtered_count: i32,
    }

    impl From<steamworks::Universe> for Universe {
        fn from(value: steamworks::Universe) -> Self {
            match value {
                steamworks::Universe::Invalid => Universe::Invalid,
                steamworks::Universe::Public => Universe::Public,
                steamworks::Universe::Beta => Universe::Beta,
                steamworks::Universe::Internal => Universe::Internal,
                steamworks::Universe::Dev => Universe::Dev,
            }
        }
    }

    impl From<steamworks::FileSignatureCheck> for FileSignatureStatus {
        fn from(value: steamworks::FileSignatureCheck) -> Self {
            match value {
                steamworks::FileSignatureCheck::ValidSignature => {
                    FileSignatureStatus::ValidSignature
                }
                steamworks::FileSignatureCheck::InvalidSignature => {
                    FileSignatureStatus::InvalidSignature
                }
                steamworks::FileSignatureCheck::FileNotFound => FileSignatureStatus::FileNotFound,
                steamworks::FileSignatureCheck::NoSignaturesFoundForThisApp => {
                    FileSignatureStatus::NoSignaturesFoundForThisApp
                }
                steamworks::FileSignatureCheck::NoSignaturesFoundForThisFile => {
                    FileSignatureStatus::NoSignaturesFoundForThisFile
                }
            }
        }
    }

    impl From<Ipv6Protocol> for steamworks::Ipv6Protocol {
        fn from(value: Ipv6Protocol) -> Self {
            match value {
                Ipv6Protocol::Http => steamworks::Ipv6Protocol::Http,
                Ipv6Protocol::Udp => steamworks::Ipv6Protocol::Udp,
            }
        }
    }

    impl From<steamworks::Ipv6ConnectivityState> for Ipv6ConnectivityState {
        fn from(value: steamworks::Ipv6ConnectivityState) -> Self {
            match value {
                steamworks::Ipv6ConnectivityState::Unknown => Ipv6ConnectivityState::Unknown,
                steamworks::Ipv6ConnectivityState::Good => Ipv6ConnectivityState::Good,
                steamworks::Ipv6ConnectivityState::Bad => Ipv6ConnectivityState::Bad,
            }
        }
    }

    impl From<TextFilteringContext> for steamworks::TextFilteringContext {
        fn from(value: TextFilteringContext) -> Self {
            match value {
                TextFilteringContext::Unknown => steamworks::TextFilteringContext::Unknown,
                TextFilteringContext::GameContent => steamworks::TextFilteringContext::GameContent,
                TextFilteringContext::Chat => steamworks::TextFilteringContext::Chat,
                TextFilteringContext::Name => steamworks::TextFilteringContext::Name,
            }
        }
    }

    /// Reads a SteamID from a BigInt. Returns `None` for a negative value or one that does not fit in 64 bits.
    fn steam_id_from_bigint(value: &BigInt) -> Option<steamworks::SteamId> {
        let (signed, raw, lossless) = value.get_u64();
        (!signed && lossless).then(|| steamworks::SteamId::from_raw(raw))
    }

    /// Returns the AppID of the running game.
    /// @returns the AppID
    #[napi]
    pub fn get_app_id() -> u32 {
        let client = crate::client::get_client();
        client.utils().app_id().0
    }

    /// Returns the current time on the Steam servers.
    /// @returns seconds since 1970-01-01 UTC
    #[napi]
    pub fn get_server_real_time() -> u32 {
        let client = crate::client::get_client();
        client.utils().get_server_real_time()
    }

    /// Checks whether Steam is running on a Steam Deck.
    /// @returns `true` on a Steam Deck, otherwise `false`
    #[napi]
    pub fn is_steam_running_on_steam_deck() -> bool {
        let client = crate::client::get_client();
        client.utils().is_steam_running_on_steam_deck()
    }

    #[napi]
    pub enum GamepadTextInputMode {
        Normal,
        Password,
    }

    #[napi]
    pub enum GamepadTextInputLineMode {
        SingleLine,
        MultipleLines,
    }

    /// @returns the entered text, or null if cancelled or could not show the input
    #[napi]
    pub async fn show_gamepad_text_input(
        input_mode: GamepadTextInputMode,
        input_line_mode: GamepadTextInputLineMode,
        description: String,
        max_characters: u32,
        existing_text: Option<String>,
    ) -> Option<String> {
        let client = crate::client::get_client();

        let (tx, rx) = oneshot::channel();
        let mut tx = Some(tx);

        let opened = client.utils().show_gamepad_text_input(
            match input_mode {
                GamepadTextInputMode::Normal => kGamepadTextInputMode::Normal,
                GamepadTextInputMode::Password => kGamepadTextInputMode::Password,
            },
            match input_line_mode {
                GamepadTextInputLineMode::SingleLine => kGamepadTextInputLineMode::SingleLine,
                GamepadTextInputLineMode::MultipleLines => kGamepadTextInputLineMode::MultipleLines,
            },
            &description,
            max_characters,
            existing_text.as_deref(),
            move |dismissed_data| {
                if let Some(tx) = tx.take() {
                    let text = client
                        .utils()
                        .get_entered_gamepad_text_input(&dismissed_data);
                    tx.send(text).unwrap();
                }
            },
        );

        if opened {
            rx.await.unwrap()
        } else {
            None
        }
    }

    #[napi]
    pub enum FloatingGamepadTextInputMode {
        SingleLine,
        MultipleLines,
        Email,
        Numeric,
    }

    /// @returns true if the floating keyboard was shown, otherwise, false
    #[napi]
    pub async fn show_floating_gamepad_text_input(
        keyboard_mode: FloatingGamepadTextInputMode,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    ) -> bool {
        let client = crate::client::get_client();

        let (tx, rx) = oneshot::channel();
        let mut tx = Some(tx);

        let opened = client.utils().show_floating_gamepad_text_input(
            match keyboard_mode {
                FloatingGamepadTextInputMode::SingleLine => {
                    kFloatingGamepadTextInputMode::SingleLine
                }
                FloatingGamepadTextInputMode::MultipleLines => {
                    kFloatingGamepadTextInputMode::MultipleLines
                }
                FloatingGamepadTextInputMode::Email => kFloatingGamepadTextInputMode::Email,
                FloatingGamepadTextInputMode::Numeric => kFloatingGamepadTextInputMode::Numeric,
            },
            x,
            y,
            width,
            height,
            move || {
                if let Some(tx) = tx.take() {
                    tx.send(true).unwrap();
                }
            },
        );

        if opened {
            rx.await.unwrap()
        } else {
            false
        }
    }

    /// @returns true when the Steam overlay is enabled for the running game
    #[napi]
    pub fn is_overlay_enabled() -> bool {
        let client = crate::client::get_client();
        client.utils().is_overlay_enabled()
    }

    /// @returns true when Steam is running in Big Picture mode
    #[napi]
    pub fn is_steam_in_big_picture_mode() -> bool {
        let client = crate::client::get_client();
        client.utils().is_steam_in_big_picture_mode()
    }

    /// @returns the language code of the Steam UI, for example `english` or `schinese`
    #[napi]
    pub fn get_ui_language() -> String {
        let client = crate::client::get_client();
        client.utils().ui_language()
    }

    /// Returns the seconds since the user was last active in the game. The SDK header does not define "active" any further; unverified against a live Steam client.
    /// @returns the number of seconds, as an unsigned 32-bit integer
    #[napi]
    pub fn get_seconds_since_app_active() -> u32 {
        let client = crate::client::get_client();
        client.utils().seconds_since_app_active()
    }

    /// Returns the seconds since the user was last active on this computer. The SDK header does not define "active" any further; unverified against a live Steam client.
    /// @returns the number of seconds, as an unsigned 32-bit integer
    #[napi]
    pub fn get_seconds_since_computer_active() -> u32 {
        let client = crate::client::get_client();
        client.utils().seconds_since_computer_active()
    }

    /// @returns the Steam universe this client connects to, or `null` when the SDK reports a value this binding does not name
    #[napi]
    pub fn get_connected_universe() -> Option<Universe> {
        let client = crate::client::get_client();
        client.utils().connected_universe().map(Universe::from)
    }

    /// @returns the battery charge in percent (0 to 100), or 255 while the computer is on AC power
    #[napi]
    pub fn get_current_battery_power() -> u32 {
        let client = crate::client::get_client();
        u32::from(client.utils().current_battery_power())
    }

    /// Returns the number of IPC calls made since the previous call, and starts a new count. Every IPC call costs at least a thread context switch, so a high count per frame means the game talks to Steam too often.
    /// @returns the count since the previous call, as an unsigned 32-bit integer
    #[napi]
    pub fn get_ipc_call_count() -> u32 {
        let client = crate::client::get_client();
        client.utils().ipc_call_count()
    }

    /// Returns whether the overlay needs the game to present a frame (`Present` or `SwapBuffers`). Only games that redraw on events instead of every frame need this; the SDK suggests polling it about 33 times a second.
    /// @returns `true` when a present is needed, otherwise `false`
    #[napi]
    pub fn overlay_needs_present() -> bool {
        let client = crate::client::get_client();
        client.utils().overlay_needs_present()
    }

    /// Starts checking a file against the signing set on the partner site, for example to refuse modified executables. Resolves once Steam answers; the answer arrives while `runCallbacks()` runs.
    /// An app with no signing set resolves with `NoSignaturesFoundForThisApp`, which is a result and not an error.
    /// @param fileName - path of the file to check; a name with a NUL character is rejected
    /// @returns the verdict for the file
    #[napi]
    pub async fn check_file_signature(file_name: String) -> Result<FileSignatureStatus, Error> {
        let client = crate::client::get_client();
        let (tx, rx) = oneshot::channel();
        client.utils().check_file_signature(&file_name, |result| {
            let _ = tx.send(result);
        });
        let status = await_completion(rx, "checking the file signature").await?;
        Ok(FileSignatureStatus::from(status))
    }

    /// @returns the length of the text the user last entered in the gamepad text dialog. The SDK header does not state the unit or whether the terminator counts; unverified against a live Steam client.
    #[napi]
    pub fn get_entered_gamepad_text_length() -> u32 {
        let client = crate::client::get_client();
        client.utils().entered_gamepad_text_length()
    }

    /// @returns `true` when Steam itself runs in VR mode, otherwise `false`
    #[napi]
    pub fn is_steam_running_in_vr() -> bool {
        let client = crate::client::get_client();
        client.utils().is_steam_running_in_vr()
    }

    /// Sets the inset, in pixels, of overlay notifications from the corner the game chose for them.
    /// @param horizontal - pixels from the side edge of that corner
    /// @param vertical - pixels from the top or bottom edge of that corner
    #[napi]
    pub fn set_overlay_notification_inset(horizontal: i32, vertical: i32) {
        let client = crate::client::get_client();
        client
            .utils()
            .set_overlay_notification_inset(horizontal, vertical);
    }

    /// @returns `true` when HMD content is streamed through Steam Remote Play. The default is `true` unless the game's app info sets `VRHeadsetStreaming` to `0`.
    #[napi]
    pub fn is_vr_headset_streaming_enabled() -> bool {
        let client = crate::client::get_client();
        client.utils().is_vr_headset_streaming_enabled()
    }

    /// Sets whether HMD content is streamed through Steam Remote Play. `true` streams the headset scene and blocks remote input; `false` streams the application window and allows remote input.
    /// @param enabled - the new setting
    #[napi]
    pub fn set_vr_headset_streaming_enabled(enabled: bool) {
        let client = crate::client::get_client();
        client.utils().set_vr_headset_streaming_enabled(enabled);
    }

    /// @returns `true` when this Steam client is the Steam China launcher rather than the global client, otherwise `false`
    #[napi]
    pub fn is_steam_china_launcher() -> bool {
        let client = crate::client::get_client();
        client.utils().is_steam_china_launcher()
    }

    /// Loads the text filter dictionaries for the language the game runs in. Call it before `filterText`.
    /// @returns `false` when filtering is unavailable for that language; `filterText` then returns the text unchanged
    #[napi]
    pub fn init_filter_text() -> bool {
        let client = crate::client::get_client();
        client.utils().init_filter_text()
    }

    /// Filters a message with the legally required filter and the user's account preferences. Needs `initFilterText()` first.
    /// @param context - the kind of text being filtered
    /// @param sourceSteamId64 - the 64-bit SteamID of whoever wrote the text
    /// @param message - the text to filter
    /// @returns the filtered text and the number of characters changed, or `null` when the message contains a NUL character or the SteamID is not a valid 64-bit value
    #[napi]
    pub fn filter_text(
        context: TextFilteringContext,
        source_steam_id64: BigInt,
        message: String,
    ) -> Option<FilteredText> {
        let source = steam_id_from_bigint(&source_steam_id64)?;
        let client = crate::client::get_client();
        client
            .utils()
            .filter_text(context.into(), source, &message)
            .ok()
            .map(|filtered| FilteredText {
                text: filtered.text,
                filtered_count: filtered.filtered_count,
            })
    }

    /// Returns what Steam believes the machine's IPv6 connectivity to the internet is, on one protocol. It does not tell whether the Steam client itself connects over IPv6.
    /// @param protocol - the protocol to test
    /// @returns the state, or `null` when the SDK reports a value this binding does not name
    #[napi]
    pub fn get_ipv6_connectivity_state(protocol: Ipv6Protocol) -> Option<Ipv6ConnectivityState> {
        let client = crate::client::get_client();
        client
            .utils()
            .ipv6_connectivity_state(protocol.into())
            .map(Ipv6ConnectivityState::from)
    }

    /// Turns on or off Steam Input translation of controller input into mouse and keyboard input. Use it in game launchers that have no controller support of their own.
    /// @param enabled - `true` to turn the translation on
    #[napi]
    pub fn set_game_launcher_mode(enabled: bool) {
        let client = crate::client::get_client();
        client.utils().set_game_launcher_mode(enabled);
    }

    /// Dismisses the full-screen gamepad text dialog that `showGamepadTextInput` opened. The header does not say whether that call's Promise then settles (unverified).
    /// @returns the SDK's result as it is; the header does not say what `false` means (unverified)
    #[napi]
    pub fn dismiss_gamepad_text_input() -> bool {
        let client = crate::client::get_client();
        client.utils().dismiss_gamepad_text_input()
    }

    /// Dismisses the floating keyboard that `showFloatingGamepadTextInput` opened.
    /// @returns the SDK's result as it is; the header does not say what `false` means (unverified)
    #[napi]
    pub fn dismiss_floating_gamepad_text_input() -> bool {
        let client = crate::client::get_client();
        client.utils().dismiss_floating_gamepad_text_input()
    }
}
