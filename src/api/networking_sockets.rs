use napi_derive::napi;

#[napi(js_name = "networkingSockets")]
pub mod networking_sockets {
    use crate::api::networking_utils::networking_utils::{
        ensure_steam, steam_client, NetworkingAvailability,
    };
    use napi::bindgen_prelude::{BigInt, Buffer, Error};
    use std::net::SocketAddr;
    use steamworks::{
        networking_sockets::{ListenSocket as SteamListenSocket, NetConnection, NetPollGroup},
        networking_types::{
            AppNetConnectionEnd, ConnectionRequest, ListenSocketEvent as SteamSocketEvent,
            NetConnectionEnd, NetConnectionInfo, NetworkingConfigEntry,
            NetworkingConnectionState as SteamConnectionState, NetworkingIdentity, SendFlags,
        },
        SteamId,
    };

    /// High-level state of a connection, as reported by Steam.
    #[napi]
    pub enum NetworkingConnectionState {
        /// The connection handle is invalid or the connection has been closed.
        None,
        /// Trying to establish the connection, including authentication.
        Connecting,
        /// Looking for a route to the peer.
        FindingRoute,
        /// Connected and ready to send and receive.
        Connected,
        /// The peer closed the connection.
        ClosedByPeer,
        /// Steam detected a problem on the local side.
        ProblemDetectedLocally,
    }

    impl From<SteamConnectionState> for NetworkingConnectionState {
        fn from(state: SteamConnectionState) -> Self {
            match state {
                SteamConnectionState::None => Self::None,
                SteamConnectionState::Connecting => Self::Connecting,
                SteamConnectionState::FindingRoute => Self::FindingRoute,
                SteamConnectionState::Connected => Self::Connected,
                SteamConnectionState::ClosedByPeer => Self::ClosedByPeer,
                SteamConnectionState::ProblemDetectedLocally => Self::ProblemDetectedLocally,
            }
        }
    }

    /// The kind of a `SocketEvent`.
    #[napi]
    pub enum ListenSocketEventKind {
        /// A peer asked to connect. Answer it with `accept` or `reject`.
        Connecting,
        /// A connection was established. Get it with `takeConnection`.
        Connected,
        /// A connection ended.
        Disconnected,
    }

    /// Connection details from `Connection.getInfo`.
    #[napi(object)]
    pub struct ConnectionInfo {
        pub state: NetworkingConnectionState,
        /// SteamID of the remote peer, or `null` when it is unknown.
        #[napi(ts_type = "bigint | null")]
        pub steam_id64: Option<BigInt>,
        /// User data set with `setUserData`. `-1` when none is set.
        pub user_data: BigInt,
        /// Steam's end reason code once the connection has ended, otherwise `null`.
        #[napi(ts_type = "number | null")]
        pub end_reason: Option<i32>,
    }

    /// Real-time statistics from `Connection.getRealtimeStatus`.
    #[napi(object)]
    pub struct ConnectionRealtimeStatus {
        pub state: NetworkingConnectionState,
        /// Round-trip ping in milliseconds.
        pub ping: i32,
        /// Quality of the link as measured locally, from 0 to 1.
        pub connection_quality_local: f64,
        /// Quality of the link as measured by the peer, from 0 to 1.
        pub connection_quality_remote: f64,
        pub out_bytes_per_sec: f64,
        pub in_bytes_per_sec: f64,
        pub send_rate_bytes_per_sec: i32,
        pub pending_unreliable: i32,
        pub pending_reliable: i32,
        pub sent_unacked_reliable: i32,
        pub queued_send_bytes: i64,
    }

    /// A message received from a poll group, from `PollGroup.receiveMessages`.
    #[napi(object)]
    pub struct PollGroupMessage {
        pub data: Buffer,
        /// The user data of the connection that received the message.
        pub connection_user_data: BigInt,
    }

    fn closed_error() -> Error {
        Error::from_reason("connection has been closed")
    }

    fn listen_socket_closed_error() -> Error {
        Error::from_reason("listen socket has been closed")
    }

    fn to_error(error: impl std::fmt::Display) -> Error {
        Error::from_reason(error.to_string())
    }

    fn invalid_handle() -> Error {
        Error::from_reason("Steam rejected the handle because it is invalid")
    }

    fn to_big_int(id: SteamId) -> BigInt {
        BigInt::from(id.raw())
    }

    fn steam_id_of(steam_id64: &BigInt) -> SteamId {
        SteamId::from_raw(steam_id64.get_u64().1)
    }

    fn parse_address(address: &str) -> Result<SocketAddr, Error> {
        address
            .parse::<SocketAddr>()
            .map_err(|e| Error::from_reason(format!("invalid address \"{address}\": {e}")))
    }

    fn parse_send_flags(send_flags: i32) -> Result<SendFlags, Error> {
        SendFlags::from_bits(send_flags)
            .ok_or_else(|| Error::from_reason(format!("invalid send flags: {send_flags}")))
    }

    /// Steam-side strings cannot contain NUL bytes; the steamworks binding would panic on them.
    fn no_nul(value: &str, field: &str) -> Result<(), Error> {
        if value.contains('\0') {
            Err(Error::from_reason(format!(
                "{field} must not contain a NUL character"
            )))
        } else {
            Ok(())
        }
    }

    fn end_reason_or_generic(end_reason: Option<i32>) -> NetConnectionEnd {
        end_reason
            .map(NetConnectionEnd::from)
            .unwrap_or(NetConnectionEnd::App(AppNetConnectionEnd::generic_normal()))
    }

    /// An event from a listen socket. Read `kind` first.
    /// A `Connecting` event must be answered with `accept` or `reject`. A `Connected` event gives its connection with `takeConnection`.
    #[napi]
    pub struct SocketEvent {
        kind: ListenSocketEventKind,
        steam_id: Option<SteamId>,
        user_data: i64,
        end_reason: Option<i32>,
        pending: Option<SteamSocketEvent>,
    }

    impl SocketEvent {
        fn from_steam(event: SteamSocketEvent) -> Self {
            let (kind, remote, user_data, end_reason) = match &event {
                SteamSocketEvent::Connecting(request) => (
                    ListenSocketEventKind::Connecting,
                    request.remote(),
                    request.user_data(),
                    None,
                ),
                SteamSocketEvent::Connected(connected) => (
                    ListenSocketEventKind::Connected,
                    connected.remote(),
                    connected.user_data(),
                    None,
                ),
                SteamSocketEvent::Disconnected(disconnected) => (
                    ListenSocketEventKind::Disconnected,
                    disconnected.remote(),
                    disconnected.user_data(),
                    Some(i32::from(disconnected.end_reason())),
                ),
            };
            Self {
                kind,
                steam_id: remote.steam_id(),
                user_data,
                end_reason,
                pending: Some(event),
            }
        }

        fn take_request(&mut self) -> Result<ConnectionRequest, Error> {
            match self.pending.take() {
                Some(SteamSocketEvent::Connecting(request)) => Ok(request),
                other => {
                    self.pending = other;
                    Err(Error::from_reason(
                        "event is not an unanswered connection request",
                    ))
                }
            }
        }
    }

    #[napi]
    impl SocketEvent {
        /// The kind of event.
        #[napi(getter)]
        pub fn kind(&self) -> ListenSocketEventKind {
            self.kind
        }

        /// SteamID of the remote peer, or `null` when the peer has no SteamID.
        #[napi(getter, ts_type = "bigint | null")]
        pub fn steam_id64(&self) -> Option<BigInt> {
            self.steam_id.map(to_big_int)
        }

        /// User data of the connection, as stored by Steam.
        #[napi(getter)]
        pub fn user_data(&self) -> BigInt {
            BigInt::from(self.user_data)
        }

        /// Steam's end reason code, set only for `Disconnected` events.
        #[napi(getter, ts_type = "number | null")]
        pub fn end_reason(&self) -> Option<i32> {
            self.end_reason
        }

        /// Accepts a `Connecting` event. The connection then arrives as a `Connected` event on the same listen socket.
        #[napi]
        pub fn accept(&mut self) -> Result<(), Error> {
            ensure_steam()?;
            let request = self.take_request()?;
            request.accept().map_err(to_error)
        }

        /// Rejects a `Connecting` event.
        /// @param endReason - Steam end reason code. Defaults to the generic application code.
        /// @param debugMessage - Optional diagnostic text sent to the peer
        /// @returns `false` when Steam could not close the connection.
        #[napi]
        pub fn reject(
            &mut self,
            end_reason: Option<i32>,
            debug_message: Option<String>,
        ) -> Result<bool, Error> {
            ensure_steam()?;
            if let Some(text) = &debug_message {
                no_nul(text, "debugMessage")?;
            }
            let request = self.take_request()?;
            Ok(request.reject(end_reason_or_generic(end_reason), debug_message.as_deref()))
        }

        /// Takes the connection of a `Connected` event. Can be called once.
        #[napi]
        pub fn take_connection(&mut self) -> Result<Connection, Error> {
            ensure_steam()?;
            match self.pending.take() {
                Some(SteamSocketEvent::Connected(connected)) => Ok(Connection {
                    inner: Some(connected.take_connection()),
                }),
                other => {
                    self.pending = other;
                    Err(Error::from_reason(
                        "event is not a connected event, or its connection was already taken",
                    ))
                }
            }
        }
    }

    /// A listening socket, from `createListenSocketIp` or `createListenSocketP2P`.
    /// Poll `tryReceiveEvent` regularly while `runCallbacks()` runs, and answer connection requests quickly.
    /// Existing connections stay open after `close`; the socket only stops accepting new ones.
    #[napi]
    pub struct ListenSocket {
        inner: Option<SteamListenSocket>,
    }

    #[napi]
    impl ListenSocket {
        /// Returns the next pending event, or `null` immediately when there is none. Never waits.
        #[napi]
        pub fn try_receive_event(&self) -> Result<Option<SocketEvent>, Error> {
            let socket = self.inner.as_ref().ok_or_else(listen_socket_closed_error)?;
            Ok(socket.try_receive_event().map(SocketEvent::from_steam))
        }

        /// Stops listening. Connections that already exist are not closed.
        #[napi]
        pub fn close(&mut self) {
            let _ = self.inner.take();
        }
    }

    /// A connection to a peer. Close it with `close` when finished; operations after that return errors.
    #[napi]
    pub struct Connection {
        inner: Option<NetConnection>,
    }

    impl Connection {
        fn live(&self) -> Result<&NetConnection, Error> {
            self.inner.as_ref().ok_or_else(closed_error)
        }

        fn live_mut(&mut self) -> Result<&mut NetConnection, Error> {
            self.inner.as_mut().ok_or_else(closed_error)
        }
    }

    #[napi]
    impl Connection {
        /// Sends one message to the peer.
        /// @param sendFlags - Bitmask of Steam's `k_nSteamNetworkingSend_*` values, for example `8` for reliable or `0` for unreliable
        #[napi]
        pub fn send(&self, data: Buffer, send_flags: i32) -> Result<(), Error> {
            ensure_steam()?;
            let flags = parse_send_flags(send_flags)?;
            self.live()?
                .send_message(&data, flags)
                .map(|_| ())
                .map_err(to_error)
        }

        /// Sends messages that Nagle's algorithm is holding back, as soon as possible.
        #[napi]
        pub fn flush(&self) -> Result<(), Error> {
            ensure_steam()?;
            self.live()?.flush_messages().map_err(to_error)
        }

        /// Receives up to `batchSize` messages. Returns an empty array when none are waiting.
        #[napi]
        pub fn receive(&mut self, batch_size: u32) -> Result<Vec<Buffer>, Error> {
            ensure_steam()?;
            let messages = self
                .live_mut()?
                .receive_messages(batch_size as usize)
                .map_err(|_| invalid_handle())?;
            Ok(messages
                .into_iter()
                .map(|message| Buffer::from(message.data().to_vec()))
                .collect())
        }

        /// Closes the connection and frees its Steam handle. Calling it again returns `false`.
        /// @param endReason - Steam end reason code sent to the peer. Defaults to the generic application code.
        /// @param debugMessage - Optional diagnostic text sent to the peer
        /// @param linger - When `true`, Steam tries to send pending reliable data before closing
        /// @returns `false` when Steam could not close the connection
        #[napi]
        pub fn close(
            &mut self,
            end_reason: Option<i32>,
            debug_message: Option<String>,
            linger: Option<bool>,
        ) -> Result<bool, Error> {
            if self.inner.is_none() {
                return Ok(false);
            }
            ensure_steam()?;
            if let Some(text) = &debug_message {
                no_nul(text, "debugMessage")?;
            }
            let Some(connection) = self.inner.take() else {
                return Ok(false);
            };
            Ok(connection.close(
                end_reason_or_generic(end_reason),
                debug_message.as_deref(),
                linger.unwrap_or(false),
            ))
        }

        /// Returns the user data set with `setUserData`, or `-1` when none is set.
        #[napi]
        pub fn get_user_data(&self) -> Result<BigInt, Error> {
            ensure_steam()?;
            let value = self.live()?.connection_user_data().unwrap_or(-1);
            Ok(BigInt::from(value))
        }

        /// Stores user data on the connection. Steam returns it in events and message info.
        #[napi]
        pub fn set_user_data(&self, user_data: BigInt) -> Result<(), Error> {
            ensure_steam()?;
            self.live()?
                .set_connection_user_data(user_data.get_i64().0)
                .map_err(|_| invalid_handle())
        }

        /// Sets a name for the connection, used mostly for debugging.
        #[napi]
        pub fn set_name(&self, name: String) -> Result<(), Error> {
            ensure_steam()?;
            no_nul(&name, "name")?;
            self.live()?.set_connection_name(&name);
            Ok(())
        }

        /// Adds the connection to a poll group, so its messages come out of `PollGroup.receiveMessages`.
        #[napi]
        pub fn set_poll_group(&self, poll_group: &PollGroup) -> Result<(), Error> {
            ensure_steam()?;
            let group = poll_group.live()?;
            self.live()?.set_poll_group(group);
            Ok(())
        }

        /// Removes the connection from its poll group.
        #[napi]
        pub fn clear_poll_group(&self) -> Result<(), Error> {
            ensure_steam()?;
            self.live()?
                .clear_poll_group()
                .map_err(|_| invalid_handle())
        }

        /// Returns the state, remote SteamID and end reason of the connection.
        #[napi]
        pub fn get_info(&self) -> Result<ConnectionInfo, Error> {
            ensure_steam()?;
            let info: NetConnectionInfo = steam_client()?
                .networking_sockets()
                .get_connection_info(self.live()?)
                .map_err(|_| invalid_handle())?;
            let state = info
                .state()
                .map_err(|_| Error::from_reason("Steam reported an unknown connection state"))?;
            Ok(ConnectionInfo {
                state: state.into(),
                steam_id64: info
                    .identity_remote()
                    .and_then(|identity| identity.steam_id())
                    .map(to_big_int),
                user_data: BigInt::from(info.user_data()),
                end_reason: info.end_reason().map(i32::from),
            })
        }

        /// Returns live statistics: ping, link quality and bandwidth.
        #[napi]
        pub fn get_realtime_status(&self) -> Result<ConnectionRealtimeStatus, Error> {
            ensure_steam()?;
            let (status, _lanes) = steam_client()?
                .networking_sockets()
                .get_realtime_connection_status(self.live()?, 0)
                .map_err(to_error)?;
            let state = status
                .connection_state()
                .map_err(|_| Error::from_reason("Steam reported an unknown connection state"))?;
            Ok(ConnectionRealtimeStatus {
                state: state.into(),
                ping: status.ping(),
                connection_quality_local: f64::from(status.connection_quality_local()),
                connection_quality_remote: f64::from(status.connection_quality_remote()),
                out_bytes_per_sec: f64::from(status.out_bytes_per_sec()),
                in_bytes_per_sec: f64::from(status.in_bytes_per_sec()),
                send_rate_bytes_per_sec: status.send_rate_bytes_per_sec(),
                pending_unreliable: status.pending_unreliable(),
                pending_reliable: status.pending_reliable(),
                sent_unacked_reliable: status.sent_unacked_reliable(),
                queued_send_bytes: status.queued_send_bytes(),
            })
        }
    }

    /// A group of connections that can be polled together, from `createPollGroup`.
    #[napi]
    pub struct PollGroup {
        inner: Option<NetPollGroup>,
    }

    impl PollGroup {
        fn live(&self) -> Result<&NetPollGroup, Error> {
            self.inner
                .as_ref()
                .ok_or_else(|| Error::from_reason("poll group has been closed"))
        }
    }

    #[napi]
    impl PollGroup {
        /// Receives up to `batchSize` messages from all connections in the group.
        /// The result never has more than `batchSize` entries.
        #[napi]
        pub fn receive_messages(
            &mut self,
            batch_size: u32,
        ) -> Result<Vec<PollGroupMessage>, Error> {
            ensure_steam()?;
            let group = self
                .inner
                .as_mut()
                .ok_or_else(|| Error::from_reason("poll group has been closed"))?;
            Ok(group
                .receive_messages(batch_size as usize)
                .into_iter()
                .map(|message| PollGroupMessage {
                    data: Buffer::from(message.data().to_vec()),
                    connection_user_data: BigInt::from(message.connection_user_data()),
                })
                .collect())
        }

        /// Destroys the poll group. Connections in it stay open but are no longer polled by it.
        /// @returns `false` when the group was already closed.
        #[napi]
        pub fn close(&mut self) -> Result<bool, Error> {
            if self.inner.is_none() {
                return Ok(false);
            }
            ensure_steam()?;
            Ok(self.inner.take().is_some())
        }
    }

    /// Creates a listen socket on a UDP address. Clients connect with `connectByIpAddress`.
    /// @param address - Local address and port, for example `"0.0.0.0:27015"`
    #[napi]
    pub fn create_listen_socket_ip(address: String) -> Result<ListenSocket, Error> {
        let address = parse_address(&address)?;
        let socket = steam_client()?
            .networking_sockets()
            .create_listen_socket_ip(address, std::iter::empty::<NetworkingConfigEntry>())
            .map_err(|_| invalid_handle())?;
        Ok(ListenSocket {
            inner: Some(socket),
        })
    }

    /// Creates a listen socket for clients that connect by SteamID with `connectP2P`.
    /// @param localVirtualPort - Virtual port clients use. Use `0` when the app has only one listen socket.
    #[napi]
    pub fn create_listen_socket_p2p(local_virtual_port: i32) -> Result<ListenSocket, Error> {
        let socket = steam_client()?
            .networking_sockets()
            .create_listen_socket_p2p(
                local_virtual_port,
                std::iter::empty::<NetworkingConfigEntry>(),
            )
            .map_err(|_| invalid_handle())?;
        Ok(ListenSocket {
            inner: Some(socket),
        })
    }

    /// Connects to a listen socket on a UDP IP address. The connection is not ready until its state is `Connected`.
    /// @param address - Remote address and port, for example `"203.0.113.5:27015"`
    #[napi]
    pub fn connect_by_ip_address(address: String) -> Result<Connection, Error> {
        let address = parse_address(&address)?;
        let connection = steam_client()?
            .networking_sockets()
            .connect_by_ip_address(address, std::iter::empty::<NetworkingConfigEntry>())
            .map_err(|_| invalid_handle())?;
        Ok(Connection {
            inner: Some(connection),
        })
    }

    /// Connects to a peer by SteamID through the Steam relay network. The peer must listen with `createListenSocketP2P`.
    /// @param steamId64 - SteamID of the peer
    /// @param remoteVirtualPort - Virtual port the peer listens on
    #[napi]
    pub fn connect_p2p(steam_id64: BigInt, remote_virtual_port: i32) -> Result<Connection, Error> {
        let identity = NetworkingIdentity::new_steam_id(steam_id_of(&steam_id64));
        let connection = steam_client()?
            .networking_sockets()
            .connect_p2p(
                identity,
                remote_virtual_port,
                std::iter::empty::<NetworkingConfigEntry>(),
            )
            .map_err(|_| invalid_handle())?;
        Ok(Connection {
            inner: Some(connection),
        })
    }

    /// Creates a poll group for batch receiving from many connections.
    #[napi]
    pub fn create_poll_group() -> Result<PollGroup, Error> {
        let group = steam_client()?.networking_sockets().create_poll_group();
        Ok(PollGroup { inner: Some(group) })
    }

    /// Starts authentication, which is needed for authenticated connections. Steam retries on its own if it fails.
    /// Call it at startup if you expect to make authenticated connections.
    /// @returns The authentication status after the call; poll `getAuthenticationStatus` to follow progress.
    #[napi(ts_return_type = "networkingUtils.NetworkingAvailability")]
    pub fn init_authentication() -> Result<NetworkingAvailability, Error> {
        Ok(steam_client()?
            .networking_sockets()
            .init_authentication()
            .into())
    }

    /// Returns the current authentication status.
    #[napi(ts_return_type = "networkingUtils.NetworkingAvailability")]
    pub fn get_authentication_status() -> Result<NetworkingAvailability, Error> {
        Ok(steam_client()?
            .networking_sockets()
            .get_authentication_status()
            .into())
    }
}
