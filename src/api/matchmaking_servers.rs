use napi_derive::napi;

#[napi(js_name = "matchmakingServers")]
pub mod matchmaking_servers {
    use napi::bindgen_prelude::Error;
    use std::collections::HashMap;
    use std::ffi::CStr;
    use std::net::Ipv4Addr;
    use std::sync::{Arc, Mutex, MutexGuard};
    use steamworks::{
        AppId, GameServerItem, PingCallbacks, PlayerDetailsCallbacks, ReleaseError,
        ServerListCallbacks, ServerListRequest as SteamServerListRequest, ServerResponse,
        ServerRulesCallbacks,
    };
    use tokio::sync::oneshot;

    /// Details of one game server.
    #[napi(object)]
    pub struct GameServerDetails {
        pub ip: String,
        /// The game connection port.
        pub port: u32,
        pub query_port: u32,
        pub name: String,
        pub map: String,
        /// Players currently on the server.
        pub players: i32,
        pub max_players: i32,
        /// Latency in milliseconds.
        pub ping: u32,
    }

    #[napi(object)]
    pub struct PlayerDetails {
        pub name: String,
        pub score: i32,
        /// Time played in seconds.
        pub time_played: f64,
    }

    #[napi(object)]
    pub struct ServerRule {
        pub key: String,
        pub value: String,
    }

    impl From<GameServerItem> for GameServerDetails {
        fn from(item: GameServerItem) -> Self {
            Self {
                ip: item.addr.to_string(),
                port: u32::from(item.connection_port),
                query_port: u32::from(item.query_port),
                name: item.server_name,
                map: item.map,
                players: item.players,
                max_players: item.max_players,
                ping: u32::try_from(item.ping.as_millis()).unwrap_or(u32::MAX),
            }
        }
    }

    /// A server list request. Call `release()` when you no longer need it.
    #[napi]
    pub struct ServerListRequest {
        inner: Arc<Mutex<SteamServerListRequest>>,
    }

    fn released_error() -> Error {
        Error::from_reason("the server list request has been released or is no longer valid")
    }

    fn lock(
        request: &Arc<Mutex<SteamServerListRequest>>,
    ) -> MutexGuard<'_, SteamServerListRequest> {
        request
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[napi]
    impl ServerListRequest {
        /// @returns the number of servers in the list
        #[napi]
        pub fn get_server_count(&self) -> Result<i32, Error> {
            lock(&self.inner)
                .get_server_count()
                .map_err(|_| released_error())
        }

        /// @param index - 0-based index into the list
        /// @returns the details of the server at `index`
        #[napi]
        pub fn get_server_details(&self, index: i32) -> Result<GameServerDetails, Error> {
            lock(&self.inner)
                .get_server_details(index)
                .map(GameServerDetails::from)
                .map_err(|_| {
                    Error::from_reason(format!(
                        "server index {index} is out of range, or the server list request has been released"
                    ))
                })
        }

        /// Re-queries the whole list.
        #[napi]
        pub fn refresh_query(&self) -> Result<(), Error> {
            lock(&self.inner)
                .refresh_query()
                .map_err(|_| released_error())
        }

        /// Re-queries one server in the list.
        #[napi]
        pub fn refresh_server(&self, index: i32) -> Result<(), Error> {
            lock(&self.inner)
                .refresh_server(index)
                .map_err(|_| released_error())
        }

        /// @returns true while a refresh is in progress
        #[napi]
        pub fn is_refreshing(&self) -> Result<bool, Error> {
            lock(&self.inner)
                .is_refreshing()
                .map_err(|_| released_error())
        }

        /// Releases the request. Using it afterwards returns an error.
        #[napi]
        pub fn release(&self) -> Result<(), Error> {
            lock(&self.inner).release().map_err(|error| match error {
                ReleaseError::Released => released_error(),
                ReleaseError::Refreshing => Error::from_reason(
                    "the server list request cannot be released while it is refreshing; wait for the refresh to finish",
                ),
            })
        }
    }

    fn parse_ipv4(ip: &str) -> Result<Ipv4Addr, Error> {
        ip.parse::<Ipv4Addr>()
            .map_err(|_| Error::from_reason(format!("'{ip}' is not a valid IPv4 address")))
    }

    fn check_no_nul(value: &str, field: &str) -> Result<(), Error> {
        if value.contains('\0') {
            return Err(Error::from_reason(format!(
                "{field} must not contain a NUL character"
            )));
        }
        Ok(())
    }

    /// The server list callbacks are not used here: the request is read by polling its methods.
    fn no_op_list_callbacks() -> ServerListCallbacks {
        ServerListCallbacks::new(
            Box::new(|_: Arc<Mutex<SteamServerListRequest>>, _: i32| {}),
            Box::new(|_: Arc<Mutex<SteamServerListRequest>>, _: i32| {}),
            Box::new(|_: Arc<Mutex<SteamServerListRequest>>, _: ServerResponse| {}),
        )
    }

    fn wrap_list(
        result: Result<Arc<Mutex<SteamServerListRequest>>, ()>,
        what: &str,
    ) -> Result<ServerListRequest, Error> {
        result
            .map(|inner| ServerListRequest { inner })
            .map_err(|_| {
                Error::from_reason(format!(
                    "Steam rejected the {what} request; each filter key and value must be 255 bytes or fewer"
                ))
            })
    }

    fn owned_filters(filters: &HashMap<String, String>) -> Result<Vec<(String, String)>, Error> {
        filters
            .iter()
            .map(|(key, value)| {
                check_no_nul(key, "filter key")?;
                check_no_nul(value, "filter value")?;
                Ok((key.clone(), value.clone()))
            })
            .collect()
    }

    /// Requests the internet server list for an app.
    /// @param filters - Steam matchmaking filters, for example `{ gamedir: 'mygame' }`
    #[napi]
    pub fn internet_server_list(
        app_id: u32,
        filters: Option<HashMap<String, String>>,
    ) -> Result<ServerListRequest, Error> {
        let owned = owned_filters(&filters.unwrap_or_default())?;
        let borrowed: HashMap<&str, &str> = owned
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect();
        let client = crate::client::get_client();
        let result = client.matchmaking_servers().internet_server_list(
            AppId(app_id),
            &borrowed,
            no_op_list_callbacks(),
        );
        wrap_list(result, "internet server list")
    }

    /// Requests the list of servers the user has favourited for an app.
    #[napi]
    pub fn favorites_server_list(
        app_id: u32,
        filters: Option<HashMap<String, String>>,
    ) -> Result<ServerListRequest, Error> {
        let owned = owned_filters(&filters.unwrap_or_default())?;
        let borrowed: HashMap<&str, &str> = owned
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect();
        let client = crate::client::get_client();
        let result = client.matchmaking_servers().favorites_server_list(
            AppId(app_id),
            &borrowed,
            no_op_list_callbacks(),
        );
        wrap_list(result, "favourites server list")
    }

    /// Requests the list of servers the user has played on recently for an app.
    #[napi]
    pub fn history_server_list(
        app_id: u32,
        filters: Option<HashMap<String, String>>,
    ) -> Result<ServerListRequest, Error> {
        let owned = owned_filters(&filters.unwrap_or_default())?;
        let borrowed: HashMap<&str, &str> = owned
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect();
        let client = crate::client::get_client();
        let result = client.matchmaking_servers().history_server_list(
            AppId(app_id),
            &borrowed,
            no_op_list_callbacks(),
        );
        wrap_list(result, "history server list")
    }

    /// Requests the list of servers that the user's friends are playing on for an app.
    #[napi]
    pub fn friends_server_list(
        app_id: u32,
        filters: Option<HashMap<String, String>>,
    ) -> Result<ServerListRequest, Error> {
        let owned = owned_filters(&filters.unwrap_or_default())?;
        let borrowed: HashMap<&str, &str> = owned
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .collect();
        let client = crate::client::get_client();
        let result = client.matchmaking_servers().friends_server_list(
            AppId(app_id),
            &borrowed,
            no_op_list_callbacks(),
        );
        wrap_list(result, "friends server list")
    }

    /// Requests the list of servers on the local network for an app.
    #[napi]
    pub fn lan_server_list(app_id: u32) -> ServerListRequest {
        let client = crate::client::get_client();
        ServerListRequest {
            inner: client
                .matchmaking_servers()
                .lan_server_list(AppId(app_id), no_op_list_callbacks()),
        }
    }

    /// Pings one server.
    /// @returns the server details, including latency; rejects when the server does not respond
    #[napi]
    pub async fn ping_server(ip: String, port: u16) -> Result<GameServerDetails, Error> {
        let addr = parse_ipv4(&ip)?;
        let (tx, rx) = oneshot::channel::<Result<GameServerDetails, String>>();
        let shared = Arc::new(Mutex::new(Some(tx)));
        let on_responded = shared.clone();
        let on_failed = shared;
        let no_response = format!("the server at {ip}:{port} did not respond");
        let callbacks = PingCallbacks::new(
            Box::new(move |item: GameServerItem| {
                if let Some(tx) = on_responded.lock().unwrap().take() {
                    let _ = tx.send(Ok(GameServerDetails::from(item)));
                }
            }),
            Box::new(move || {
                if let Some(tx) = on_failed.lock().unwrap().take() {
                    let _ = tx.send(Err(no_response.clone()));
                }
            }),
        );
        let client = crate::client::get_client();
        client
            .matchmaking_servers()
            .ping_server(addr, port, callbacks);
        rx.await
            .map_err(|_| {
                Error::from_reason("the ping result was not received; the outcome is unknown")
            })?
            .map_err(Error::from_reason)
    }

    /// Lists the players on one server.
    /// @returns the players, or rejects when the server does not respond
    #[napi]
    pub async fn player_details(ip: String, port: u16) -> Result<Vec<PlayerDetails>, Error> {
        let addr = parse_ipv4(&ip)?;
        let (tx, rx) = oneshot::channel::<Result<Vec<PlayerDetails>, String>>();
        let sender = Arc::new(Mutex::new(Some(tx)));
        let players = Arc::new(Mutex::new(Vec::<PlayerDetails>::new()));
        let collected = players.clone();
        let on_complete = sender.clone();
        let on_failed = sender;
        let no_response = format!("the server at {ip}:{port} did not respond");
        let callbacks = PlayerDetailsCallbacks::new(
            Box::new(move |name: &CStr, score: i32, time_played: f32| {
                collected.lock().unwrap().push(PlayerDetails {
                    name: name.to_string_lossy().into_owned(),
                    score,
                    time_played: f64::from(time_played),
                });
            }),
            Box::new(move || {
                if let Some(tx) = on_failed.lock().unwrap().take() {
                    let _ = tx.send(Err(no_response.clone()));
                }
            }),
            Box::new(move || {
                if let Some(tx) = on_complete.lock().unwrap().take() {
                    let list = std::mem::take(&mut *players.lock().unwrap());
                    let _ = tx.send(Ok(list));
                }
            }),
        );
        let client = crate::client::get_client();
        client
            .matchmaking_servers()
            .player_details(addr, port, callbacks);
        rx.await
            .map_err(|_| {
                Error::from_reason("the player details were not received; the outcome is unknown")
            })?
            .map_err(Error::from_reason)
    }

    /// Reads the rules (key and value pairs) of one server.
    /// @returns the rules, or rejects when the server does not respond
    #[napi]
    pub async fn server_rules(ip: String, port: u16) -> Result<Vec<ServerRule>, Error> {
        let addr = parse_ipv4(&ip)?;
        let (tx, rx) = oneshot::channel::<Result<Vec<ServerRule>, String>>();
        let sender = Arc::new(Mutex::new(Some(tx)));
        let rules = Arc::new(Mutex::new(Vec::<ServerRule>::new()));
        let collected = rules.clone();
        let on_complete = sender.clone();
        let on_failed = sender;
        let no_response = format!("the server at {ip}:{port} did not respond");
        let callbacks = ServerRulesCallbacks::new(
            Box::new(move |key: &CStr, value: &CStr| {
                collected.lock().unwrap().push(ServerRule {
                    key: key.to_string_lossy().into_owned(),
                    value: value.to_string_lossy().into_owned(),
                });
            }),
            Box::new(move || {
                if let Some(tx) = on_failed.lock().unwrap().take() {
                    let _ = tx.send(Err(no_response.clone()));
                }
            }),
            Box::new(move || {
                if let Some(tx) = on_complete.lock().unwrap().take() {
                    let list = std::mem::take(&mut *rules.lock().unwrap());
                    let _ = tx.send(Ok(list));
                }
            }),
        );
        let client = crate::client::get_client();
        client
            .matchmaking_servers()
            .server_rules(addr, port, callbacks);
        rx.await
            .map_err(|_| {
                Error::from_reason("the server rules were not received; the outcome is unknown")
            })?
            .map_err(Error::from_reason)
    }
}
