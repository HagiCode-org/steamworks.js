use napi_derive::napi;

#[napi(js_name = "networkingUtils")]
pub mod networking_utils {
    use napi::bindgen_prelude::Error;
    use steamworks::{
        networking_types::{
            NetworkingAvailability as SteamAvailability, NetworkingAvailabilityError,
            NetworkingAvailabilityResult,
        },
        Client,
    };

    /// Fails with a readable error when `init()` has not been called or `shutdown()` was called.
    pub(crate) fn ensure_steam() -> Result<(), Error> {
        if crate::client::has_client() {
            Ok(())
        } else {
            Err(Error::from_reason(
                "Steam client is not initialized; call init() first",
            ))
        }
    }

    pub(crate) fn steam_client() -> Result<Client, Error> {
        ensure_steam()?;
        Ok(crate::client::get_client())
    }

    /// Availability of a networking resource. Covers every value of Steam's `ESteamNetworkingAvailability`.
    /// The numbers assigned here are not Steam's codes; compare by name.
    #[napi]
    pub enum NetworkingAvailability {
        /// Steam has not tried to use this resource yet.
        NeverTried,
        /// Waiting for another resource before it can be acquired.
        Waiting,
        /// Trying now, but not successful yet.
        Attempting,
        /// Online and available.
        Current,
        /// Steam has no information about this resource.
        Unknown,
        /// A dependent resource is missing, so this service cannot be used.
        CannotTry,
        /// Tried for long enough without ever succeeding.
        Failed,
        /// Worked before, but now there is a problem.
        Previously,
        /// Failed earlier and is retrying.
        Retrying,
    }

    impl From<NetworkingAvailabilityResult> for NetworkingAvailability {
        fn from(value: NetworkingAvailabilityResult) -> Self {
            match value {
                Ok(SteamAvailability::NeverTried) => Self::NeverTried,
                Ok(SteamAvailability::Waiting) => Self::Waiting,
                Ok(SteamAvailability::Attempting) => Self::Attempting,
                Ok(SteamAvailability::Current) => Self::Current,
                Err(NetworkingAvailabilityError::Unknown) => Self::Unknown,
                Err(NetworkingAvailabilityError::CannotTry) => Self::CannotTry,
                Err(NetworkingAvailabilityError::Failed) => Self::Failed,
                Err(NetworkingAvailabilityError::Previously) => Self::Previously,
                Err(NetworkingAvailabilityError::Retrying) => Self::Retrying,
            }
        }
    }

    /// Detailed relay network status, from `getDetailedRelayNetworkStatus`.
    #[napi(object)]
    pub struct RelayNetworkStatus {
        /// Summary status. `Current` means relay network initialisation has completed.
        pub availability: NetworkingAvailability,
        /// `true` while a latency measurement is in progress or waiting for a prerequisite.
        pub is_ping_measurement_in_progress: bool,
        /// Status of obtaining the network config, a prerequisite for relay access.
        pub network_config: NetworkingAvailability,
        /// Ability to reach any relay.
        pub any_relay: NetworkingAvailability,
        /// Non-localised English message for diagnostics only.
        pub debugging_message: String,
    }

    /// Starts relay network access. Call it at startup if you expect to use P2P or relayed connections.
    /// Steam retries automatically when needed, so calling it again only forces a retry after a failure.
    #[napi]
    pub fn init_relay_network_access() -> Result<(), Error> {
        steam_client()?
            .networking_utils()
            .init_relay_network_access();
        Ok(())
    }

    /// Returns the summary availability of the relay network.
    #[napi]
    pub fn get_relay_network_status() -> Result<NetworkingAvailability, Error> {
        Ok(steam_client()?
            .networking_utils()
            .relay_network_status()
            .into())
    }

    /// Returns the detailed relay network status, including the network config and relay reachability.
    #[napi]
    pub fn get_detailed_relay_network_status() -> Result<RelayNetworkStatus, Error> {
        let status = steam_client()?
            .networking_utils()
            .detailed_relay_network_status();
        Ok(RelayNetworkStatus {
            availability: status.availability().into(),
            is_ping_measurement_in_progress: status.is_ping_measurement_in_progress(),
            network_config: status.network_config().into(),
            any_relay: status.any_relay().into(),
            debugging_message: status.debugging_message().to_owned(),
        })
    }
}
