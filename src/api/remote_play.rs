use napi_derive::napi;

#[napi(js_name = "remotePlay")]
pub mod remote_play {
    use napi::bindgen_prelude::BigInt;
    use steamworks::{RemotePlaySessionId, SteamDeviceFormFactor, SteamId};

    #[napi(object)]
    pub struct RemotePlaySessionInfo {
        pub session_id: u32,
        pub steam_id64: BigInt,
    }

    #[napi(object)]
    pub struct RemotePlayResolution {
        pub width: u32,
        pub height: u32,
    }

    #[napi]
    pub enum DeviceFormFactor {
        Phone,
        Tablet,
        Computer,
        TV,
    }

    impl From<SteamDeviceFormFactor> for DeviceFormFactor {
        fn from(form_factor: SteamDeviceFormFactor) -> Self {
            match form_factor {
                SteamDeviceFormFactor::Phone => DeviceFormFactor::Phone,
                SteamDeviceFormFactor::Tablet => DeviceFormFactor::Tablet,
                SteamDeviceFormFactor::Computer => DeviceFormFactor::Computer,
                SteamDeviceFormFactor::TV => DeviceFormFactor::TV,
            }
        }
    }

    #[napi(object)]
    pub struct RemotePlaySessionDetails {
        /// Name of the client device, or `null` when the session has ended.
        pub client_name: Option<String>,
        /// Form factor of the client device, or `null` when unavailable.
        pub form_factor: Option<DeviceFormFactor>,
        /// Resolution of the client device, or `null` when unavailable.
        pub resolution: Option<RemotePlayResolution>,
    }

    /// Lists the active Remote Play sessions.
    #[napi]
    pub fn sessions() -> Vec<RemotePlaySessionInfo> {
        let client = crate::client::get_client();
        let remote_play = client.remote_play();
        session_ids()
            .into_iter()
            .map(|session_id| RemotePlaySessionInfo {
                session_id,
                steam_id64: BigInt::from(
                    remote_play
                        .session(RemotePlaySessionId::from_raw(session_id))
                        .user()
                        .raw(),
                ),
            })
            .collect()
    }

    /// Reads the client name, form factor and resolution of one session.
    #[napi]
    pub fn session_details(session_id: u32) -> RemotePlaySessionDetails {
        let client = crate::client::get_client();
        let session = client
            .remote_play()
            .session(RemotePlaySessionId::from_raw(session_id));
        RemotePlaySessionDetails {
            client_name: session.client_name(),
            form_factor: session.client_form_factor().map(DeviceFormFactor::from),
            resolution: session
                .client_resolution()
                .map(|(width, height)| RemotePlayResolution { width, height }),
        }
    }

    /// Invites a friend to join the game with Remote Play Together.
    /// @returns true when the invite was sent
    #[napi]
    pub fn invite(steam_id64: BigInt) -> bool {
        let client = crate::client::get_client();
        // steamworks-rs only exposes invites on a session object, but the Steam call does not depend on the session,
        // so any session handle works here.
        client
            .remote_play()
            .session(RemotePlaySessionId::from_raw(0))
            .invite(SteamId::from_raw(steam_id64.get_u64().1))
    }

    /// steamworks-rs does not expose the ID of a `RemotePlaySession`, so the IDs are read from the Steam interface.
    fn session_ids() -> Vec<u32> {
        unsafe {
            let remote_play = steamworks::sys::SteamAPI_SteamRemotePlay_v003();
            let count = steamworks::sys::SteamAPI_ISteamRemotePlay_GetSessionCount(remote_play);
            (0..count)
                .map(|index| {
                    steamworks::sys::SteamAPI_ISteamRemotePlay_GetSessionID(
                        remote_play,
                        index as i32,
                    )
                })
                .filter(|&id| id != 0)
                .collect()
        }
    }
}
