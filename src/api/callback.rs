use napi_derive::napi;

#[napi]
pub mod callback {
    use napi::{
        threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
        JsFunction,
    };

    #[napi]
    pub struct Handle {
        handle: Option<steamworks::CallbackHandle>,
    }

    #[napi]
    impl Handle {
        /// Stops the handler registered for this Handle from being called. Calling it again does nothing.
        #[napi]
        pub fn disconnect(&mut self) {
            // The CallbackHandle automatically disconnects when dropped
            // Taking the handle from Option causes it to drop
            let _ = self.handle.take();
        }
    }

    #[napi]
    pub enum SteamCallback {
        PersonaStateChange,
        SteamServersConnected,
        SteamServersDisconnected,
        SteamServerConnectFailure,
        LobbyDataUpdate,
        LobbyChatUpdate,
        P2PSessionRequest,
        P2PSessionConnectFail,
        GameLobbyJoinRequested,
        MicroTxnAuthorizationResponse,
        DownloadItemResult,
        UserStatsReceived,
        UserStatsStored,
        UserAchievementStored,
        GameOverlayActivated,
        GameRichPresenceJoinRequested,
        LobbyEnter,
        LobbyChatMsg,
        ScreenshotRequested,
        ScreenshotReady,
        NewUrlLaunchParameters,
        AuthSessionTicketResponse,
        ValidateAuthTicketResponse,
    }

    /// Registers a handler for a Steam callback. Needs `init()`.
    /// The handler receives each callback payload as a JSON-compatible value on the JavaScript event loop. Steam events are dispatched only while `runCallbacks()` runs.
    /// @param steamCallback - The callback kind to listen for.
    /// @param handler - Called with each payload of that callback.
    /// @returns a Handle; call `disconnect()` on it to stop the handler.
    #[napi(ts_generic_types = "C extends keyof import('./callbacks').CallbackReturns")]
    pub fn register(
        #[napi(ts_arg_type = "C")] steam_callback: SteamCallback,
        #[napi(ts_arg_type = "(value: import('./callbacks').CallbackReturns[C]) => void")] handler: JsFunction,
    ) -> Handle {
        let threadsafe_handler: ThreadsafeFunction<serde_json::Value, ErrorStrategy::Fatal> =
            handler
                .create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))
                .unwrap();

        let handle = match steam_callback {
            SteamCallback::PersonaStateChange => {
                register_callback::<steamworks::PersonaStateChange>(threadsafe_handler)
            }
            SteamCallback::SteamServersConnected => {
                register_callback::<steamworks::SteamServersConnected>(threadsafe_handler)
            }
            SteamCallback::SteamServersDisconnected => {
                register_callback::<steamworks::SteamServersDisconnected>(threadsafe_handler)
            }
            SteamCallback::SteamServerConnectFailure => {
                register_callback::<steamworks::SteamServerConnectFailure>(threadsafe_handler)
            }
            SteamCallback::LobbyDataUpdate => {
                register_callback::<steamworks::LobbyDataUpdate>(threadsafe_handler)
            }
            SteamCallback::LobbyChatUpdate => {
                register_callback::<steamworks::LobbyChatUpdate>(threadsafe_handler)
            }
            SteamCallback::P2PSessionRequest => {
                register_callback::<steamworks::P2PSessionRequest>(threadsafe_handler)
            }
            SteamCallback::P2PSessionConnectFail => {
                register_callback::<steamworks::P2PSessionConnectFail>(threadsafe_handler)
            }
            SteamCallback::GameLobbyJoinRequested => {
                register_callback::<steamworks::GameLobbyJoinRequested>(threadsafe_handler)
            }
            SteamCallback::MicroTxnAuthorizationResponse => {
                register_callback::<steamworks::MicroTxnAuthorizationResponse>(threadsafe_handler)
            }
            SteamCallback::DownloadItemResult => {
                register_callback::<steamworks::DownloadItemResult>(threadsafe_handler)
            }
            SteamCallback::UserStatsReceived => {
                register_callback::<steamworks::UserStatsReceived>(threadsafe_handler)
            }
            SteamCallback::UserStatsStored => {
                register_callback::<steamworks::UserStatsStored>(threadsafe_handler)
            }
            SteamCallback::UserAchievementStored => {
                register_callback::<steamworks::UserAchievementStored>(threadsafe_handler)
            }
            SteamCallback::GameOverlayActivated => {
                register_callback::<steamworks::GameOverlayActivated>(threadsafe_handler)
            }
            SteamCallback::GameRichPresenceJoinRequested => {
                register_callback::<steamworks::GameRichPresenceJoinRequested>(threadsafe_handler)
            }
            SteamCallback::LobbyEnter => {
                register_callback::<steamworks::LobbyEnter>(threadsafe_handler)
            }
            SteamCallback::LobbyChatMsg => {
                register_callback::<steamworks::LobbyChatMsg>(threadsafe_handler)
            }
            SteamCallback::ScreenshotRequested => register_callback::<
                steamworks::screenshots::ScreenshotRequested,
            >(threadsafe_handler),
            SteamCallback::ScreenshotReady => {
                register_callback::<steamworks::screenshots::ScreenshotReady>(threadsafe_handler)
            }
            SteamCallback::NewUrlLaunchParameters => {
                register_callback::<steamworks::NewUrlLaunchParameters>(threadsafe_handler)
            }
            SteamCallback::AuthSessionTicketResponse => {
                register_callback::<steamworks::AuthSessionTicketResponse>(threadsafe_handler)
            }
            SteamCallback::ValidateAuthTicketResponse => {
                register_callback::<steamworks::ValidateAuthTicketResponse>(threadsafe_handler)
            }
        };

        Handle {
            handle: Some(handle),
        }
    }

    fn register_callback<C>(
        threadsafe_handler: ThreadsafeFunction<serde_json::Value, ErrorStrategy::Fatal>,
    ) -> steamworks::CallbackHandle
    where
        C: steamworks::Callback + serde::Serialize,
    {
        let client = crate::client::get_client();
        client.register_callback(move |value: C| {
            let value = serde_json::to_value(&value).unwrap();
            threadsafe_handler.call(value, ThreadsafeFunctionCallMode::Blocking);
        })
    }
}
