use napi::bindgen_prelude::Error;
use napi_derive::napi;
use steamworks::AppId;
use steamworks::Client;
use steamworks::SteamAPIInitError;

pub mod client;

#[macro_use]
extern crate lazy_static;

/// Initializes the Steam client for this process and requests the user's stats. If a client already exists, it is dropped first.
/// Needs the Steam client to be running. Throws an Error carrying Steam's reason when initialization fails.
/// Unverified against a live Steam client: whether a logged-out Steam client initializes.
/// @param appId - The Steam app ID to initialize as. Omit it to use the app ID the SDK resolves on its own (for example from `steam_appid.txt`).
#[napi]
pub fn init(app_id: Option<u32>) -> Result<(), Error> {
    if client::has_client() {
        client::drop_client();
    }

    let steam_client = app_id
        .map(|app_id| Client::init_app(AppId(app_id)))
        .unwrap_or_else(Client::init)
        .map_err(|e| match e {
            SteamAPIInitError::FailedGeneric(msg)
            | SteamAPIInitError::NoSteamClient(msg)
            | SteamAPIInitError::VersionMismatch(msg) => Error::from_reason(msg),
            SteamAPIInitError::UnknownResult(code, msg) => {
                Error::from_reason(format!("unknown Steam init result {code}: {msg}"))
            }
        })?;

    let steam_id = steam_client.user().steam_id().raw();
    steam_client.user_stats().request_user_stats(steam_id);

    client::set_client(steam_client);
    Ok(())
}

/// Checks whether Steam must relaunch this app. Does not need `init()`.
/// Returns true when the app was not started by Steam and has no `steam_appid.txt`. Steam then starts the app through its client, and the app should exit as soon as possible. Returns false when Steam launched the app or `steam_appid.txt` is present.
/// @param appId - The Steam app ID of the game.
/// @returns true if Steam is relaunching the app and it should quit, otherwise false.
#[napi]
pub fn restart_app_if_necessary(app_id: u32) -> bool {
    steamworks::restart_app_if_necessary(AppId(app_id))
}

/// Dispatches pending Steam callbacks and call results to the handlers registered with `register()` and to pending async calls. Call it regularly, for example once per frame or on a timer, or events are delayed.
/// Does nothing before `init()` or after `shutdown()`.
#[napi]
pub fn run_callbacks() {
    if client::has_client() {
        client::get_client().run_callbacks();
    }
}

/// Releases the Steam client, which shuts down the Steam API. Safe to call when no client exists.
/// After this call `isConnected()` returns false, and `init()` must run again before other Steam APIs are used.
#[napi]
pub fn shutdown() {
    client::drop_client();
}

/// Returns whether a Steam client is held, meaning `init()` succeeded and `shutdown()` has not been called since. Does not check that the Steam client is running or that a user is logged in.
/// @returns true if the client is initialized, otherwise false.
#[napi]
pub fn is_connected() -> bool {
    client::has_client()
}

pub mod api;
