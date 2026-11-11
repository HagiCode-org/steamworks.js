use napi_derive::napi;

#[napi(js_name = "networkingMessages")]
pub mod networking_messages {
    use crate::api::networking_utils::networking_utils::{ensure_steam, steam_client};
    use napi::{
        bindgen_prelude::{BigInt, Buffer, Error},
        threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
        JsFunction,
    };
    use steamworks::{
        networking_types::{NetworkingIdentity, SendFlags},
        SteamId,
    };

    /// A message received on a channel, from `receiveMessagesOnChannel`.
    #[napi(object)]
    pub struct ReceivedMessage {
        pub data: Buffer,
        /// SteamID of the sender, or `null` when the sender has no SteamID.
        #[napi(ts_type = "bigint | null")]
        pub steam_id64: Option<BigInt>,
        /// The channel the message was sent on.
        pub channel: i32,
    }

    /// A session that failed to be established, passed to the `onSessionFailed` handler.
    #[napi(object)]
    pub struct SessionFailure {
        /// SteamID of the peer, or `null` when the peer has no SteamID.
        #[napi(ts_type = "bigint | null")]
        pub steam_id64: Option<BigInt>,
        /// Steam's end reason code, or `null` when Steam gave none.
        #[napi(ts_type = "number | null")]
        pub end_reason: Option<i32>,
    }

    /// An incoming session request. Call `accept` or `reject` in the `onSessionRequest` handler.
    /// A request that is never answered is rejected when this object is garbage collected.
    #[napi]
    pub struct SessionRequest {
        steam_id: Option<SteamId>,
        inner: Option<steamworks::networking_messages::SessionRequest>,
    }

    fn already_answered() -> Error {
        Error::from_reason("session request was already accepted or rejected")
    }

    fn to_big_int(id: SteamId) -> BigInt {
        BigInt::from(id.raw())
    }

    #[napi]
    impl SessionRequest {
        /// SteamID of the user asking to start a session, or `null` when the peer has no SteamID.
        #[napi(getter, ts_type = "bigint | null")]
        pub fn steam_id64(&self) -> Option<BigInt> {
            self.steam_id.map(to_big_int)
        }

        /// Accepts the session.
        /// @returns `false` when Steam did not accept it.
        #[napi]
        pub fn accept(&mut self) -> Result<bool, Error> {
            ensure_steam()?;
            let request = self.inner.take().ok_or_else(already_answered)?;
            Ok(request.accept())
        }

        /// Rejects the session, so it is not established.
        #[napi]
        pub fn reject(&mut self) -> Result<(), Error> {
            ensure_steam()?;
            let request = self.inner.take().ok_or_else(already_answered)?;
            request.reject();
            Ok(())
        }
    }

    fn steam_id_of(steam_id64: &BigInt) -> SteamId {
        SteamId::from_raw(steam_id64.get_u64().1)
    }

    fn parse_send_flags(send_flags: i32) -> Result<SendFlags, Error> {
        SendFlags::from_bits(send_flags)
            .ok_or_else(|| Error::from_reason(format!("invalid send flags: {send_flags}")))
    }

    /// Sends a message to a Steam user on a channel. A session is created implicitly when needed.
    /// The receiver must call `receiveMessagesOnChannel` with the same channel.
    /// @param steamId64 - SteamID of the receiver
    /// @param sendFlags - Bitmask of Steam's `k_nSteamNetworkingSend_*` values, for example `8` for reliable or `0` for unreliable
    /// @param data - Payload bytes
    /// @param channel - Routing number; use `0` when you do not need channels
    #[napi]
    pub fn send_message_to_user(
        steam_id64: BigInt,
        send_flags: i32,
        data: Buffer,
        channel: u32,
    ) -> Result<(), Error> {
        let flags = parse_send_flags(send_flags)?;
        let identity = NetworkingIdentity::new_steam_id(steam_id_of(&steam_id64));
        steam_client()?
            .networking_messages()
            .send_message_to_user(identity, flags, &data, channel)
            .map_err(|e| Error::from_reason(e.to_string()))
    }

    /// Receives the messages waiting on a channel. Returns an empty array when there are none.
    /// @param channel - The channel to read; messages on other channels are not returned
    /// @param batchSize - Maximum number of messages to return
    #[napi]
    pub fn receive_messages_on_channel(
        channel: u32,
        batch_size: u32,
    ) -> Result<Vec<ReceivedMessage>, Error> {
        let messages = steam_client()?
            .networking_messages()
            .receive_messages_on_channel(channel, batch_size as usize);
        Ok(messages
            .into_iter()
            .map(|message| ReceivedMessage {
                data: Buffer::from(message.data().to_vec()),
                steam_id64: message.identity_peer().steam_id().map(to_big_int),
                channel: message.channel(),
            })
            .collect())
    }

    /// Registers the handler for incoming session requests, replacing any previous handler.
    /// Steam reports requests during `runCallbacks()`, and the handler then runs on the JavaScript event loop.
    /// It must call `accept` or `reject` on the request.
    #[napi]
    pub fn on_session_request(
        #[napi(ts_arg_type = "(request: SessionRequest) => void")] handler: JsFunction,
    ) -> Result<(), Error> {
        let handler: ThreadsafeFunction<SessionRequest, ErrorStrategy::Fatal> =
            handler.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;
        steam_client()?
            .networking_messages()
            .session_request_callback(move |request| {
                let steam_id = request.remote().steam_id();
                let _ = handler.call(
                    SessionRequest {
                        steam_id,
                        inner: Some(request),
                    },
                    ThreadsafeFunctionCallMode::NonBlocking,
                );
            });
        Ok(())
    }

    /// Registers the handler for session failures, replacing any previous handler.
    /// Steam reports failures during `runCallbacks()`, and the handler then runs on the JavaScript event loop.
    #[napi]
    pub fn on_session_failed(
        #[napi(ts_arg_type = "(failure: SessionFailure) => void")] handler: JsFunction,
    ) -> Result<(), Error> {
        let handler: ThreadsafeFunction<SessionFailure, ErrorStrategy::Fatal> =
            handler.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;
        steam_client()?
            .networking_messages()
            .session_failed_callback(move |info| {
                let failure = SessionFailure {
                    steam_id64: info
                        .identity_remote()
                        .and_then(|identity| identity.steam_id())
                        .map(to_big_int),
                    end_reason: info.end_reason().map(i32::from),
                };
                let _ = handler.call(failure, ThreadsafeFunctionCallMode::NonBlocking);
            });
        Ok(())
    }
}
