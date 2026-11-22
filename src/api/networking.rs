use napi_derive::napi;

#[napi]
pub mod networking {
    use napi::{
        bindgen_prelude::{BigInt, Buffer},
        Error,
    };
    use steamworks::SteamId;

    use crate::api::localplayer::PlayerSteamId;

    #[napi(object)]
    pub struct P2PPacket {
        pub data: Buffer,
        pub size: i32,
        pub steam_id: PlayerSteamId,
    }

    #[napi]
    /// The method used to send a packet
    pub enum SendType {
        /// Send the packet directly over udp.
        ///
        /// Can't be larger than 1200 bytes
        Unreliable,
        /// Like `Unreliable` but doesn't buffer packets
        /// sent before the connection has started.
        UnreliableNoDelay,
        /// Reliable packet sending.
        ///
        /// Can't be larger than 1 megabyte.
        Reliable,
        /// Like `Reliable` but applies the nagle
        /// algorithm to packets being sent
        ReliableWithBuffering,
    }

    /// Sends a packet to another user over Steam peer-to-peer networking.
    /// @param steamId64 - recipient SteamID64 as a BigInt
    /// @param sendType - delivery mode; each mode has its own size limit
    /// @param data - packet payload
    /// @returns `true` when Steam queued the packet
    #[napi]
    pub fn send_p2p_packet(
        steam_id64: BigInt,
        send_type: SendType,
        data: Buffer,
    ) -> Result<bool, Error> {
        let client = crate::client::get_client();
        let result = client.networking().send_p2p_packet(
            SteamId::from_raw(steam_id64.get_u64().1),
            match send_type {
                SendType::Unreliable => steamworks::SendType::Unreliable,
                SendType::UnreliableNoDelay => steamworks::SendType::UnreliableNoDelay,
                SendType::Reliable => steamworks::SendType::Reliable,
                SendType::ReliableWithBuffering => steamworks::SendType::ReliableWithBuffering,
            },
            &data,
        );
        Ok(result)
    }

    /// Checks whether a packet is waiting to be read on channel 0.
    /// @returns the size in bytes of the next packet, or `0` when none is waiting
    #[napi]
    pub fn is_p2p_packet_available() -> i32 {
        let client = crate::client::get_client();
        client
            .networking()
            .is_p2p_packet_available()
            .unwrap_or_default() as i32
    }

    /// Reads the next waiting packet on channel 0.
    /// @param size - size of the receive buffer in bytes
    /// @returns `data` (the buffer), `size` (bytes read) and `steamId` of the sender; rejects with `No packet available` when none is waiting
    #[napi]
    pub fn read_p2p_packet(size: i32) -> Result<P2PPacket, Error> {
        let client = crate::client::get_client();
        let mut buffer = vec![0; size as usize];

        client
            .networking()
            .read_p2p_packet(&mut buffer)
            .map(|(steam_id, read_size)| P2PPacket {
                data: buffer.into(),
                size: read_size as i32,
                steam_id: PlayerSteamId::from_steamid(steam_id),
            })
            .ok_or_else(|| {
                Error::new(
                    napi::Status::GenericFailure,
                    "No packet available".to_string(),
                )
            })
    }

    /// Accepts a peer-to-peer session request from a user. Call it in response to a session request from that user.
    /// @param steamId64 - SteamID64 of the user as a BigInt
    #[napi]
    pub fn accept_p2p_session(steam_id64: BigInt) {
        let client = crate::client::get_client();
        client
            .networking()
            .accept_p2p_session(SteamId::from_raw(steam_id64.get_u64().1));
    }

    /// Sends a packet to another user on a specific channel. Each channel is an independent stream.
    /// @param steamId64 - recipient SteamID64 as a BigInt
    /// @param sendType - delivery mode; each mode has its own size limit
    /// @param data - packet payload
    /// @param channel - channel number
    /// @returns `true` when Steam queued the packet
    #[napi]
    pub fn send_p2p_packet_on_channel(
        steam_id64: BigInt,
        send_type: SendType,
        data: Buffer,
        channel: i32,
    ) -> bool {
        let client = crate::client::get_client();
        client.networking().send_p2p_packet_on_channel(
            SteamId::from_raw(steam_id64.get_u64().1),
            match send_type {
                SendType::Unreliable => steamworks::SendType::Unreliable,
                SendType::UnreliableNoDelay => steamworks::SendType::UnreliableNoDelay,
                SendType::Reliable => steamworks::SendType::Reliable,
                SendType::ReliableWithBuffering => steamworks::SendType::ReliableWithBuffering,
            },
            &data,
            channel,
        )
    }

    /// @returns the size of the next packet on the channel, or 0 when none is waiting
    #[napi]
    pub fn is_p2p_packet_available_on_channel(channel: i32) -> i32 {
        let client = crate::client::get_client();
        client
            .networking()
            .is_p2p_packet_available_on_channel(channel)
            .unwrap_or_default() as i32
    }

    /// Reads the next packet on a channel. Rejects when no packet is waiting.
    #[napi]
    pub fn read_p2p_packet_from_channel(size: i32, channel: i32) -> Result<P2PPacket, Error> {
        if size < 0 {
            return Err(Error::from_reason("size must not be negative"));
        }
        let client = crate::client::get_client();
        let mut buffer = vec![0; size as usize];

        client
            .networking()
            .read_p2p_packet_from_channel(&mut buffer, channel)
            .map(|(steam_id, read_size)| P2PPacket {
                data: buffer.into(),
                size: read_size as i32,
                steam_id: PlayerSteamId::from_steamid(steam_id),
            })
            .ok_or_else(|| {
                Error::new(
                    napi::Status::GenericFailure,
                    "No packet available".to_string(),
                )
            })
    }

    /// Closes the P2P session with a user.
    /// @returns true when a session existed and was closed
    #[napi]
    pub fn close_p2p_session(steam_id64: BigInt) -> bool {
        let client = crate::client::get_client();
        client
            .networking()
            .close_p2p_session(SteamId::from_raw(steam_id64.get_u64().1))
    }
}
