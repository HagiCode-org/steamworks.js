use napi_derive::napi;

#[napi]
pub mod matchmaking {
    use crate::api::localplayer::PlayerSteamId;
    use napi::bindgen_prelude::{BigInt, Error};
    use std::collections::HashMap;
    use steamworks::LobbyId;
    use tokio::sync::oneshot;

    #[napi]
    pub enum LobbyType {
        Private,
        FriendsOnly,
        Public,
        Invisible,
    }

    #[napi]
    pub struct Lobby {
        pub id: BigInt,
        lobby_id: LobbyId,
    }

    #[napi]
    impl Lobby {
        /// Joins this lobby.
        /// @returns a `Lobby` for the joined lobby; rejects with `Failed to join lobby` when Steam refuses the join
        #[napi]
        pub async fn join(&self) -> Result<Lobby, Error> {
            join_lobby(self.id.clone()).await
        }

        /// Leaves this lobby.
        #[napi]
        pub fn leave(&self) {
            let client = crate::client::get_client();
            client.matchmaking().leave_lobby(self.lobby_id);
        }

        /// Opens the Steam invite dialog for this lobby.
        #[napi]
        pub fn open_invite_dialog(&self) {
            let client = crate::client::get_client();
            client.friends().activate_invite_dialog(self.lobby_id);
        }

        /// Returns the number of members currently in this lobby.
        /// @returns the member count
        #[napi]
        pub fn get_member_count(&self) -> usize {
            let client = crate::client::get_client();
            client.matchmaking().lobby_member_count(self.lobby_id)
        }

        /// Returns the maximum number of members this lobby allows.
        /// @returns the member limit, or `null` when Steam has no metadata for the lobby
        #[napi]
        pub fn get_member_limit(&self) -> Option<usize> {
            let client = crate::client::get_client();
            client.matchmaking().lobby_member_limit(self.lobby_id)
        }

        /// Returns the members of this lobby.
        /// @returns a `PlayerSteamId` for each member, empty when there are none
        #[napi]
        pub fn get_members(&self) -> Vec<PlayerSteamId> {
            let client = crate::client::get_client();
            client
                .matchmaking()
                .lobby_members(self.lobby_id)
                .into_iter()
                .map(PlayerSteamId::from_steamid)
                .collect()
        }

        /// Returns the owner of this lobby.
        /// @returns the owner's `PlayerSteamId`
        #[napi]
        pub fn get_owner(&self) -> PlayerSteamId {
            let client = crate::client::get_client();
            PlayerSteamId::from_steamid(client.matchmaking().lobby_owner(self.lobby_id))
        }

        /// Sets whether new users may join this lobby. Only the lobby owner can change this.
        /// @param joinable - `true` to allow joining, `false` to block it
        /// @returns `true` when Steam accepted the change
        #[napi]
        pub fn set_joinable(&self, joinable: bool) -> bool {
            let client = crate::client::get_client();
            client
                .matchmaking()
                .set_lobby_joinable(self.lobby_id, joinable)
        }

        /// Reads one metadata value of this lobby.
        /// @param key - metadata key
        /// @returns the value, or `null` when the key is not set
        #[napi]
        pub fn get_data(&self, key: String) -> Option<String> {
            let client = crate::client::get_client();
            client
                .matchmaking()
                .lobby_data(self.lobby_id, &key)
                .map(|s| s.to_string())
        }

        /// Sets one metadata value of this lobby. Only the lobby owner can set lobby data.
        /// @param key - metadata key
        /// @param value - value to store
        /// @returns `true` when Steam accepted the change
        #[napi]
        pub fn set_data(&self, key: String, value: String) -> bool {
            let client = crate::client::get_client();
            client
                .matchmaking()
                .set_lobby_data(self.lobby_id, &key, &value)
        }

        /// Deletes one metadata value of this lobby. Only the lobby owner can delete lobby data.
        /// @param key - metadata key to delete
        /// @returns `true` when Steam accepted the change
        #[napi]
        pub fn delete_data(&self, key: String) -> bool {
            let client = crate::client::get_client();
            client.matchmaking().delete_lobby_data(self.lobby_id, &key)
        }

        /// Get an object containing all the lobby data
        #[napi]
        pub fn get_full_data(&self) -> HashMap<String, String> {
            let client = crate::client::get_client();

            let mut data = HashMap::new();

            let count = client.matchmaking().lobby_data_count(self.lobby_id);
            for i in 0..count {
                let maybe_lobby_data = client.matchmaking().lobby_data_by_index(self.lobby_id, i);

                if let Some((key, value)) = maybe_lobby_data {
                    data.insert(key, value);
                }
            }

            data
        }

        /// Merge current lobby data with provided data in a single batch
        /// @returns true if all data was set successfully
        #[napi]
        pub fn merge_full_data(&self, data: HashMap<String, String>) -> bool {
            let matchmaking = crate::client::get_client().matchmaking();
            data.iter()
                .all(|(key, value)| matchmaking.set_lobby_data(self.lobby_id, key, value))
        }
    }

    /// Creates a new lobby and makes the local user its owner.
    /// @param lobbyType - visibility of the lobby
    /// @param maxMembers - maximum number of members; Steam rejects values above 250
    /// @returns the new `Lobby`; rejects with Steam's error text when creation fails
    #[napi]
    pub async fn create_lobby(lobby_type: LobbyType, max_members: u32) -> Result<Lobby, Error> {
        let client = crate::client::get_client();

        let (tx, rx) = oneshot::channel();

        client.matchmaking().create_lobby(
            match lobby_type {
                LobbyType::Private => steamworks::LobbyType::Private,
                LobbyType::FriendsOnly => steamworks::LobbyType::FriendsOnly,
                LobbyType::Public => steamworks::LobbyType::Public,
                LobbyType::Invisible => steamworks::LobbyType::Invisible,
            },
            max_members,
            |result| {
                tx.send(result).unwrap();
            },
        );

        rx.await
            .unwrap()
            .map(|lobby_id| Lobby {
                id: BigInt::from(lobby_id.raw()),
                lobby_id,
            })
            .map_err(|e| Error::from_reason(e.to_string()))
    }

    /// Joins a lobby by its ID.
    /// @param lobbyId - lobby ID as a BigInt
    /// @returns the joined `Lobby`; rejects with `Failed to join lobby` when Steam refuses the join
    #[napi]
    pub async fn join_lobby(lobby_id: BigInt) -> Result<Lobby, Error> {
        let client = crate::client::get_client();

        let (tx, rx) = oneshot::channel();

        client.matchmaking().join_lobby(
            steamworks::LobbyId::from_raw(lobby_id.get_u64().1),
            |result| {
                tx.send(result).unwrap();
            },
        );

        rx.await
            .unwrap()
            .map(|lobby_id| Lobby {
                id: BigInt::from(lobby_id.raw()),
                lobby_id,
            })
            .map_err(|_| Error::from_reason("Failed to join lobby".to_string()))
    }

    /// Requests the lobby list from Steam. The list follows the filters Steam applies by default. Unverified against a live Steam client.
    /// @returns a `Lobby` for each lobby in the result; rejects with an error when the request fails
    #[napi]
    pub async fn get_lobbies() -> Result<Vec<Lobby>, Error> {
        let client = crate::client::get_client();

        let (tx, rx) = oneshot::channel();

        client.matchmaking().request_lobby_list(|lobbies| {
            tx.send(lobbies).unwrap();
        });

        rx.await
            .unwrap()
            .map(|lobbies| {
                lobbies
                    .iter()
                    .map(|lobby_id| Lobby {
                        id: BigInt::from(lobby_id.raw()),
                        lobby_id: *lobby_id,
                    })
                    .collect()
            })
            .map_err(|e| Error::from_reason(e.to_string()))
    }
}
