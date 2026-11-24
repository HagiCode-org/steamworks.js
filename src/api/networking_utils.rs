use napi_derive::napi;

#[napi(js_name = "networkingUtils")]
pub mod networking_utils {
    use napi::bindgen_prelude::{BigInt, Either3, Error};
    use std::time::Duration;
    use steamworks::{
        networking_types::NetworkingIdentity,
        networking_types::{
            NetworkingAvailability as SteamAvailability, NetworkingAvailabilityError,
            NetworkingAvailabilityResult, NetworkingConfigDataType,
        },
        networking_utils::{
            config_value_from_raw, pop_code, ConfigValueScope, FakeIpType as SteamFakeIpType,
            NetworkingConfigValueData, NetworkingIpAddr, NetworkingPingLocation, NetworkingUtils,
        },
        sys, Client,
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

    /// This host's position on Valve's network, from `getLocalPingLocation()`.
    #[napi(object)]
    pub struct LocalPingLocation {
        /// The location as text. Its format may change between SDK versions, so pass it only to the functions in this namespace, and do not parse it yourself.
        pub location: String,
        /// Age of the ping data in seconds.
        pub age_seconds: f64,
    }

    /// One Valve data center (POP), from `getPops()`.
    #[napi(object)]
    pub struct DataCenter {
        /// The data center ID, as Steam encodes it.
        pub id: u32,
        /// Readable code of the data center, such as `iad`. Usually three or four characters.
        pub code: String,
        /// Best relayed ping in milliseconds, or `null` when Steam has no estimate.
        pub ping: Option<i32>,
    }

    /// The best relayed route to a data center, from `getPingToDataCenter()`.
    #[napi(object)]
    pub struct DataCenterRoute {
        /// Relayed ping in milliseconds.
        pub ping_ms: i32,
        /// The data center the route goes through, as its ID.
        pub via_pop: u32,
        /// Readable code of `viaPop`.
        pub via_code: String,
    }

    /// Classification of an address against Steam's fake IP range. The numbers are not Steam's codes; compare by name.
    #[napi]
    pub enum FakeIpType {
        /// The value is not an IP address.
        Invalid,
        /// A valid IP address outside the fake range.
        NotFake,
        /// A globally unique IPv4 address for this app, managed by Steam.
        GlobalIpv4,
        /// A locally unique IPv4 address, managed by this process. Do not share it.
        LocalIpv4,
    }

    impl From<SteamFakeIpType> for FakeIpType {
        fn from(value: SteamFakeIpType) -> Self {
            match value {
                SteamFakeIpType::Invalid => Self::Invalid,
                SteamFakeIpType::NotFake => Self::NotFake,
                SteamFakeIpType::GlobalIpv4 => Self::GlobalIpv4,
                SteamFakeIpType::LocalIpv4 => Self::LocalIpv4,
            }
        }
    }

    /// Description of a config value, from `getConfigValueInfo()`.
    #[napi(object)]
    pub struct ConfigValueInfo {
        /// The SDK name of the value, such as `TimeoutInitial`.
        pub name: String,
        /// Type of the value: `int32`, `int64`, `float`, `string`, or `callback` (a pointer that cannot be read from JavaScript).
        pub data_type: String,
        /// Scope the value can be set at: `global`, `socketsInterface`, `listenSocket` or `connection`.
        pub scope: String,
    }

    fn utils() -> Result<NetworkingUtils, Error> {
        Ok(steam_client()?.networking_utils())
    }

    fn parse_location(
        utils: &NetworkingUtils,
        text: &str,
        field: &str,
    ) -> Result<NetworkingPingLocation, Error> {
        utils
            .parse_ping_location(text)
            .ok_or_else(|| Error::from_reason(format!("{field} is not a ping location string")))
    }

    fn parse_address(utils: &NetworkingUtils, text: &str) -> Result<NetworkingIpAddr, Error> {
        utils
            .parse_ip_addr(text)
            .ok_or_else(|| Error::from_reason(format!("{text} is not an IP address")))
    }

    fn parse_identity_text(
        utils: &NetworkingUtils,
        text: &str,
    ) -> Result<NetworkingIdentity, Error> {
        utils
            .parse_identity(text)
            .ok_or_else(|| Error::from_reason(format!("{text} is not a networking identity")))
    }

    fn config_value(raw: i32) -> Result<sys::ESteamNetworkingConfigValue, Error> {
        config_value_from_raw(raw)
            .ok_or_else(|| Error::from_reason(format!("{raw} is not a networking config value")))
    }

    fn check_text(value: &str, field: &str) -> Result<(), Error> {
        if value.contains('\0') {
            return Err(Error::from_reason(format!(
                "{field} must not contain a NUL character"
            )));
        }
        Ok(())
    }

    /// Returns this host's position on Valve's network and the age of that data. Returns `null` when Steam has no ping data yet, which takes a few seconds after `initRelayNetworkAccess()`. Needs `init()`.
    /// @returns The location text and the data age in seconds, or `null` when no data is available.
    #[napi]
    pub fn get_local_ping_location() -> Result<Option<LocalPingLocation>, Error> {
        let utils = utils()?;
        Ok(utils
            .local_ping_location()
            .map(|(location, age)| LocalPingLocation {
                location: utils.ping_location_to_string(&location),
                age_seconds: f64::from(age),
            }))
    }

    /// Parses ping location text, such as one shared by another player, and returns it in Steam's normalized text form. Needs `init()`.
    /// @param location - The location text to check.
    /// @returns The normalized text, or `null` when Steam does not understand the text.
    #[napi]
    pub fn parse_ping_location(location: String) -> Result<Option<String>, Error> {
        check_text(&location, "location")?;
        let utils = utils()?;
        Ok(utils
            .parse_ping_location(&location)
            .map(|parsed| utils.ping_location_to_string(&parsed)))
    }

    /// Estimates the round-trip time between two ping locations, through the relay network. It does not send packets. Needs `init()`.
    /// @param first - Location text from `getLocalPingLocation()` or `parsePingLocation()`.
    /// @param second - The other location text.
    /// @returns The estimate in milliseconds, or `null` when Steam cannot estimate it. Throws when either text is not understood.
    #[napi]
    pub fn estimate_ping_between_locations(
        first: String,
        second: String,
    ) -> Result<Option<i32>, Error> {
        let utils = utils()?;
        let first = parse_location(&utils, &first, "first")?;
        let second = parse_location(&utils, &second, "second")?;
        Ok(utils.estimate_ping_between_locations(&first, &second))
    }

    /// Estimates the round-trip time from this host to a ping location. Faster than `estimatePingBetweenLocations()` when you compare many locations. Needs `init()`.
    /// @param remote - The remote location text.
    /// @returns The estimate in milliseconds, or `null` when Steam cannot estimate it. Throws when the text is not understood.
    #[napi]
    pub fn estimate_ping_from_local_host(remote: String) -> Result<Option<i32>, Error> {
        let utils = utils()?;
        let remote = parse_location(&utils, &remote, "remote")?;
        Ok(utils.estimate_ping_from_local_host(&remote))
    }

    /// Checks whether ping data at most `maxAgeSeconds` old exists. If it does not, Steam starts a new measurement and this returns `false`. Needs `init()`.
    /// Only call it when you need a fresh measurement now, for example after a user request. Steam refreshes the data on its own.
    /// @param maxAgeSeconds - The oldest acceptable age of the data, in seconds. Must be finite and not negative.
    /// @returns `true` when recent enough data already exists.
    #[napi]
    pub fn check_ping_data_up_to_date(max_age_seconds: f64) -> Result<bool, Error> {
        let max_age = Duration::try_from_secs_f64(max_age_seconds).map_err(|_| {
            Error::from_reason("maxAgeSeconds must be a finite, non-negative number")
        })?;
        Ok(utils()?.check_ping_data_up_to_date(max_age))
    }

    /// Returns the best relayed route to a data center, with its ping and the data center the route uses. Needs `init()`.
    /// @param pop - The data center ID, from `getPops()`.
    /// @returns The route, or `null` when Steam has no estimate.
    #[napi]
    pub fn get_ping_to_data_center(pop: u32) -> Result<Option<DataCenterRoute>, Error> {
        let utils = utils()?;
        Ok(utils
            .ping_to_data_center(pop)
            .map(|(ping_ms, via_pop)| DataCenterRoute {
                ping_ms,
                via_pop,
                via_code: pop_code(via_pop),
            }))
    }

    /// Returns the direct ping, without relaying, to the relays at a data center. Needs `init()`.
    /// @param pop - The data center ID.
    /// @returns The ping in milliseconds, or `null` when Steam has no estimate.
    #[napi]
    pub fn get_direct_ping_to_pop(pop: u32) -> Result<Option<i32>, Error> {
        Ok(utils()?.direct_ping_to_pop(pop))
    }

    /// Returns the number of data centers (POPs) in the network config. Needs `init()`.
    #[napi]
    pub fn get_pop_count() -> Result<u32, Error> {
        Ok(utils()?.pop_count() as u32)
    }

    /// Returns every data center in the network config, with its code and best relayed ping. Needs `init()`.
    /// @returns One entry per data center. An empty array when the config lists none, or when Steam has not loaded it yet.
    #[napi]
    pub fn get_pops() -> Result<Vec<DataCenter>, Error> {
        let utils = utils()?;
        Ok(utils
            .pop_list()
            .into_iter()
            .map(|id| DataCenter {
                id,
                code: pop_code(id),
                ping: utils.ping_to_data_center(id).map(|(ping, _)| ping),
            })
            .collect())
    }

    /// Returns the local timestamp in microseconds. It never goes backwards, and it is only comparable within this run of the process. Needs `init()`.
    /// @returns The timestamp as a BigInt.
    #[napi]
    pub fn get_local_timestamp() -> Result<BigInt, Error> {
        Ok(BigInt::from(utils()?.local_timestamp()))
    }

    /// Returns `true` when an IPv4 address is in Steam's fake IP range. Needs `init()`.
    /// @param ipv4 - The IPv4 address as the SDK's 32-bit number. Its byte order is unverified against a live Steam client.
    #[napi]
    pub fn is_fake_ipv4(ipv4: u32) -> Result<bool, Error> {
        Ok(utils()?.is_fake_ipv4(ipv4))
    }

    /// Classifies an IPv4 address against the fake IP range. Needs `init()`.
    /// @param ipv4 - The IPv4 address as the SDK's 32-bit number. Its byte order is unverified against a live Steam client.
    #[napi]
    pub fn get_ipv4_fake_ip_type(ipv4: u32) -> Result<FakeIpType, Error> {
        Ok(utils()?.fake_ipv4_type(ipv4).into())
    }

    /// Returns the real identity behind a fake IP address, as text. Steam keeps the mapping for active connections and for a short time after they close. Needs `init()`.
    /// @param fakeIp - The fake address, as `ip` or `ip:port` text.
    /// @returns The identity text. Throws with Steam's reason when the address is not a fake IP (InvalidParameter) or the mapping is unknown (NoMatch).
    #[napi]
    pub fn get_real_identity_for_fake_ip(fake_ip: String) -> Result<String, Error> {
        let utils = utils()?;
        let address = parse_address(&utils, &fake_ip)?;
        let identity = utils
            .real_identity_for_fake_ip(&address)
            .map_err(|e| Error::from_reason(e.to_string()))?;
        Ok(utils.identity_to_string(&identity))
    }

    /// Formats an IP address in Steam's text form. Needs `init()`.
    /// @param address - The address text, with or without a port.
    /// @param withPort - Whether to include the port in the output.
    /// @returns The formatted address. Throws when the text is not an IP address.
    #[napi]
    pub fn ip_addr_to_string(address: String, with_port: bool) -> Result<String, Error> {
        let utils = utils()?;
        let parsed = parse_address(&utils, &address)?;
        Ok(utils.ip_addr_to_string(&parsed, with_port))
    }

    /// Parses an IP address and returns it in Steam's text form, with the port. Needs `init()`.
    /// @param address - The address text.
    /// @returns The normalized text, or `null` when Steam does not understand it.
    #[napi]
    pub fn parse_ip_addr(address: String) -> Result<Option<String>, Error> {
        check_text(&address, "address")?;
        let utils = utils()?;
        Ok(utils
            .parse_ip_addr(&address)
            .map(|parsed| utils.ip_addr_to_string(&parsed, true)))
    }

    /// Classifies an IP address against Steam's fake IP range. Needs `init()`.
    /// @param address - The address text, with or without a port.
    /// @returns The classification. Throws when the text is not an IP address.
    #[napi]
    pub fn get_ip_addr_fake_ip_type(address: String) -> Result<FakeIpType, Error> {
        let utils = utils()?;
        let parsed = parse_address(&utils, &address)?;
        Ok(utils.ip_addr_fake_ip_type(&parsed).into())
    }

    /// Formats a networking identity (such as a SteamID or an IP address) in Steam's text form. Use it for logs and storage; do not parse the text yourself. Needs `init()`.
    /// @param identity - The identity text.
    /// @returns The formatted identity. Throws when the text is not an identity.
    #[napi]
    pub fn identity_to_string(identity: String) -> Result<String, Error> {
        let utils = utils()?;
        let parsed = parse_identity_text(&utils, &identity)?;
        Ok(utils.identity_to_string(&parsed))
    }

    /// Parses a networking identity text and returns it in Steam's normalized form. Needs `init()`.
    /// @param identity - The identity text.
    /// @returns The normalized text, or `null` when Steam does not understand it.
    #[napi]
    pub fn parse_identity(identity: String) -> Result<Option<String>, Error> {
        check_text(&identity, "identity")?;
        let utils = utils()?;
        Ok(utils
            .parse_identity(&identity)
            .map(|parsed| utils.identity_to_string(&parsed)))
    }

    /// Sets a global `int32` config value. Needs `init()`.
    /// @param valueId - The config value number, from `getConfigValueInfo()` or `iterateGenericEditableConfigValues()`.
    /// @returns `true` when Steam accepted the value, `false` when it refused it (for example the setting has another type).
    #[napi]
    pub fn set_global_config_value_int32(value_id: i32, value: i32) -> Result<bool, Error> {
        let value_id = config_value(value_id)?;
        Ok(utils()?
            .set_global_config_value_int32(value_id, value)
            .is_ok())
    }

    /// Sets a global `float` config value. Needs `init()`.
    /// @param valueId - The config value number.
    /// @returns `true` when Steam accepted the value, `false` when it refused it.
    #[napi]
    pub fn set_global_config_value_float(value_id: i32, value: f64) -> Result<bool, Error> {
        let value_id = config_value(value_id)?;
        Ok(utils()?
            .set_global_config_value_float(value_id, value as f32)
            .is_ok())
    }

    /// Sets a global `string` config value. Needs `init()`.
    /// @param valueId - The config value number.
    /// @returns `true` when Steam accepted the value, `false` when it refused it. Throws when the text contains a NUL character.
    #[napi]
    pub fn set_global_config_value_string(value_id: i32, value: String) -> Result<bool, Error> {
        let value_id = config_value(value_id)?;
        check_text(&value, "value")?;
        Ok(utils()?
            .set_global_config_value_string(value_id, &value)
            .is_ok())
    }

    /// Sets an `int32` config value on one connection. Needs `init()`.
    /// The JavaScript `Connection` object does not expose its handle yet, so pass the raw `HSteamNetConnection` number from another source.
    /// @param connection - The raw connection handle.
    /// @returns `true` when Steam accepted the value, `false` when it refused it or the connection handle is invalid.
    #[napi]
    pub fn set_connection_config_value_int32(
        connection: u32,
        value_id: i32,
        value: i32,
    ) -> Result<bool, Error> {
        let value_id = config_value(value_id)?;
        Ok(utils()?
            .set_connection_config_value_int32(connection, value_id, value)
            .is_ok())
    }

    /// Sets a `float` config value on one connection. Needs `init()`. See `setConnectionConfigValueInt32()` for the handle.
    /// @param connection - The raw connection handle.
    /// @returns `true` when Steam accepted the value, `false` otherwise.
    #[napi]
    pub fn set_connection_config_value_float(
        connection: u32,
        value_id: i32,
        value: f64,
    ) -> Result<bool, Error> {
        let value_id = config_value(value_id)?;
        Ok(utils()?
            .set_connection_config_value_float(connection, value_id, value as f32)
            .is_ok())
    }

    /// Sets a `string` config value on one connection. Needs `init()`. See `setConnectionConfigValueInt32()` for the handle.
    /// @param connection - The raw connection handle.
    /// @returns `true` when Steam accepted the value, `false` otherwise. Throws when the text contains a NUL character.
    #[napi]
    pub fn set_connection_config_value_string(
        connection: u32,
        value_id: i32,
        value: String,
    ) -> Result<bool, Error> {
        let value_id = config_value(value_id)?;
        check_text(&value, "value")?;
        Ok(utils()?
            .set_connection_config_value_string(connection, value_id, &value)
            .is_ok())
    }

    /// Reads a config value, globally or for one connection. Needs `init()`.
    /// The result is a number for `int32` and `float` values, a BigInt for `int64` values (so large values stay exact), and a string for `string` values.
    /// @param valueId - The config value number.
    /// @param connection - Optional raw connection handle. When given, the value is read for that connection, falling back to the inherited value.
    /// @returns The value, or `null` when it does not exist, the connection is invalid, or the value is a callback.
    #[napi]
    pub fn get_config_value(
        value_id: i32,
        connection: Option<u32>,
    ) -> Result<Option<Either3<f64, BigInt, String>>, Error> {
        let value_id = config_value(value_id)?;
        let utils = utils()?;
        let value = match connection {
            Some(connection) => utils.get_connection_config_value(connection, value_id),
            None => utils.get_global_config_value(value_id),
        };
        Ok(value.map(|value| match value {
            NetworkingConfigValueData::Int32(v) => Either3::A(f64::from(v)),
            NetworkingConfigValueData::Float(v) => Either3::A(f64::from(v)),
            NetworkingConfigValueData::Int64(v) => Either3::B(BigInt::from(v)),
            NetworkingConfigValueData::String(v) => Either3::C(v),
        }))
    }

    /// Returns the name, type and scope of a config value. Needs `init()`.
    /// @param valueId - The config value number.
    /// @returns The description, or `null` when the value does not exist.
    #[napi]
    pub fn get_config_value_info(value_id: i32) -> Result<Option<ConfigValueInfo>, Error> {
        let value_id = config_value(value_id)?;
        Ok(utils()?
            .config_value_info(value_id)
            .map(|info| ConfigValueInfo {
                name: info.name,
                data_type: match info.data_type {
                    NetworkingConfigDataType::Int32 => "int32",
                    NetworkingConfigDataType::Int64 => "int64",
                    NetworkingConfigDataType::Float => "float",
                    NetworkingConfigDataType::String => "string",
                    NetworkingConfigDataType::Callback => "callback",
                }
                .to_owned(),
                scope: match info.scope {
                    ConfigValueScope::Global => "global",
                    ConfigValueScope::SocketsInterface => "socketsInterface",
                    ConfigValueScope::ListenSocket => "listenSocket",
                    ConfigValueScope::Connection => "connection",
                }
                .to_owned(),
            }))
    }

    /// Returns the next config value that a generic settings screen can edit. Pass `null` to start from the beginning. Needs `init()`.
    /// @param current - The value returned by the previous call, or `null` to start.
    /// @param includeDevVars - Whether to include development-only values. Keep it `false` in a shipped build.
    /// @returns The next config value number, or `null` at the end of the list.
    #[napi]
    pub fn iterate_generic_editable_config_values(
        current: Option<i32>,
        include_dev_vars: Option<bool>,
    ) -> Result<Option<i32>, Error> {
        let current = match current {
            Some(raw) => Some(config_value(raw)?),
            None => None,
        };
        Ok(utils()?
            .iterate_generic_editable_config_values(current, include_dev_vars.unwrap_or(false))
            .map(|value| value as i32))
    }
}
