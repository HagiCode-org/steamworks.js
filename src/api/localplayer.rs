use napi::bindgen_prelude::{BigInt, Error};
use napi_derive::napi;
use steamworks::SteamId;

#[derive(Debug)]
#[napi(object)]
pub struct PlayerSteamId {
    pub steam_id64: BigInt,
    pub steam_id32: String,
    pub account_id: u32,
}

impl PlayerSteamId {
    pub(crate) fn from_steamid(steam_id: SteamId) -> Self {
        Self {
            steam_id64: steam_id.raw().into(),
            steam_id32: steam_id.steamid32(),
            account_id: steam_id.account_id().raw(),
        }
    }
}

/// Reads a BigInt as an unsigned 64-bit value. Rejects negative values and values of 2^64 or more, with the argument `name` in the message.
pub(crate) fn u64_from_bigint(value: BigInt, name: &str) -> Result<u64, Error> {
    let (_, value, lossless) = value.get_u64();
    if !lossless {
        return Err(Error::from_reason(format!(
            "{name} must be a non-negative BigInt below 2^64"
        )));
    }
    Ok(value)
}

#[napi]
pub mod localplayer {
    use super::{u64_from_bigint, PlayerSteamId};
    use napi::bindgen_prelude::{BigInt, Buffer, Error};
    use std::net::Ipv4Addr;
    use steamworks::{
        DurationControl as SteamDurationControl,
        DurationControlNotification as SteamDurationControlNotification,
        DurationControlOnlineState as SteamDurationControlOnlineState,
        DurationControlProgress as SteamDurationControlProgress, GameId,
        MarketEligibility as SteamMarketEligibility, SteamId, VoiceResult as SteamVoiceResult,
    };
    use tokio::sync::oneshot;

    use crate::api::workshop::workshop::await_completion;

    /// Result of a voice call, from Steam's `EVoiceResult`. The values are the SDK numbers.
    #[napi]
    pub enum VoiceResult {
        Ok = 0,
        NotInitialized = 1,
        /// Voice is not recording. `getVoice()` returns this once a stopped recording has no audio left.
        NotRecording = 2,
        NoData = 3,
        /// The destination buffer is too small.
        BufferTooSmall = 4,
        DataCorrupted = 5,
        Restricted = 6,
        UnsupportedCodec = 7,
        ReceiverOutOfDate = 8,
        ReceiverDidNotAnswer = 9,
        /// A value this binding does not name.
        Unknown = -1,
    }

    impl From<SteamVoiceResult> for VoiceResult {
        fn from(result: SteamVoiceResult) -> Self {
            match result {
                SteamVoiceResult::Ok => VoiceResult::Ok,
                SteamVoiceResult::NotInitialized => VoiceResult::NotInitialized,
                SteamVoiceResult::NotRecording => VoiceResult::NotRecording,
                SteamVoiceResult::NoData => VoiceResult::NoData,
                SteamVoiceResult::BufferTooSmall => VoiceResult::BufferTooSmall,
                SteamVoiceResult::DataCorrupted => VoiceResult::DataCorrupted,
                SteamVoiceResult::Restricted => VoiceResult::Restricted,
                SteamVoiceResult::UnsupportedCodec => VoiceResult::UnsupportedCodec,
                SteamVoiceResult::ReceiverOutOfDate => VoiceResult::ReceiverOutOfDate,
                SteamVoiceResult::ReceiverDidNotAnswer => VoiceResult::ReceiverDidNotAnswer,
                SteamVoiceResult::Unknown => VoiceResult::Unknown,
            }
        }
    }

    /// Playtime progress for duration control, from Steam's `EDurationControlProgress`. `Half` and `NoProgress` are deprecated in the SDK.
    #[napi]
    pub enum DurationControlProgress {
        /// Full progress.
        Full = 0,
        /// Deprecated: XP or persistent rewards should be halved.
        Half = 1,
        /// Deprecated: XP or persistent rewards should be stopped.
        NoProgress = 2,
        /// The allowed 3 hours since the 5-hour gap have passed; the game should exit.
        ExitSoon3h = 3,
        /// The allowed 5 hours in the calendar day have passed; the game should exit.
        ExitSoon5h = 4,
        /// The game runs after the day period; it should exit.
        ExitSoonNight = 5,
        /// A value this binding does not name.
        Unknown = -1,
    }

    impl From<SteamDurationControlProgress> for DurationControlProgress {
        fn from(progress: SteamDurationControlProgress) -> Self {
            match progress {
                SteamDurationControlProgress::Full => DurationControlProgress::Full,
                SteamDurationControlProgress::Half => DurationControlProgress::Half,
                SteamDurationControlProgress::NoProgress => DurationControlProgress::NoProgress,
                SteamDurationControlProgress::ExitSoon3h => DurationControlProgress::ExitSoon3h,
                SteamDurationControlProgress::ExitSoon5h => DurationControlProgress::ExitSoon5h,
                SteamDurationControlProgress::ExitSoonNight => {
                    DurationControlProgress::ExitSoonNight
                }
                SteamDurationControlProgress::Unknown => DurationControlProgress::Unknown,
            }
        }
    }

    /// Which duration control notification timer expired, from Steam's `EDurationControlNotification`. `ThreeHours`, `HalfProgress` and `NoProgress` are deprecated in the SDK.
    #[napi]
    pub enum DurationControlNotification {
        /// Progress information only; there is nothing to show.
        NoNotification = 0,
        /// The user has been playing for an hour.
        OneHour = 1,
        /// Deprecated: the user has been playing for 3 hours.
        ThreeHours = 2,
        /// Deprecated: progress is half normal.
        HalfProgress = 3,
        /// Deprecated: progress is zero.
        NoProgress = 4,
        /// The allowed 3 hours since the 5-hour gap have passed; the game should exit.
        ExitSoon3h = 5,
        /// The allowed 5 hours in the calendar day have passed; the game should exit.
        ExitSoon5h = 6,
        /// The game runs after the day period; it should exit.
        ExitSoonNight = 7,
        /// A value this binding does not name.
        Unknown = -1,
    }

    impl From<SteamDurationControlNotification> for DurationControlNotification {
        fn from(notification: SteamDurationControlNotification) -> Self {
            match notification {
                SteamDurationControlNotification::NoNotification => {
                    DurationControlNotification::NoNotification
                }
                SteamDurationControlNotification::OneHour => DurationControlNotification::OneHour,
                SteamDurationControlNotification::ThreeHours => {
                    DurationControlNotification::ThreeHours
                }
                SteamDurationControlNotification::HalfProgress => {
                    DurationControlNotification::HalfProgress
                }
                SteamDurationControlNotification::NoProgress => {
                    DurationControlNotification::NoProgress
                }
                SteamDurationControlNotification::ExitSoon3h => {
                    DurationControlNotification::ExitSoon3h
                }
                SteamDurationControlNotification::ExitSoon5h => {
                    DurationControlNotification::ExitSoon5h
                }
                SteamDurationControlNotification::ExitSoonNight => {
                    DurationControlNotification::ExitSoonNight
                }
                SteamDurationControlNotification::Unknown => DurationControlNotification::Unknown,
            }
        }
    }

    /// The online state of the game for duration control, from Steam's `EDurationControlOnlineState`.
    #[napi]
    pub enum DurationControlOnlineState {
        /// Offline play: single player, offline co-op and the like. Offline time does not count against playtime limits.
        Offline = 1,
        /// Currently in online play.
        Online = 2,
        /// Currently in online play and asking not to be interrupted.
        OnlineHighPri = 3,
    }

    impl From<DurationControlOnlineState> for SteamDurationControlOnlineState {
        fn from(state: DurationControlOnlineState) -> Self {
            match state {
                DurationControlOnlineState::Offline => SteamDurationControlOnlineState::Offline,
                DurationControlOnlineState::Online => SteamDurationControlOnlineState::Online,
                DurationControlOnlineState::OnlineHighPri => {
                    SteamDurationControlOnlineState::OnlineHighPri
                }
            }
        }
    }

    /// Result of `getAvailableVoice()`.
    #[napi(object)]
    pub struct VoiceAvailable {
        /// `Ok` when the byte count is valid; otherwise the reason it is not.
        pub result: VoiceResult,
        /// Compressed bytes that `getVoice()` can return now. `0` when the result is not `Ok`.
        pub compressed_bytes: u32,
    }

    /// Result of `getVoice()` or `decompressVoice()`.
    #[napi(object)]
    pub struct VoiceChunk {
        /// The SDK result.
        pub result: VoiceResult,
        /// The bytes read or decoded. Empty unless `result` is `Ok` (or `NoData`/`BufferTooSmall`, which carry no data).
        pub data: Buffer,
    }

    /// Community Market status of the logged-in user, from Steam's `MarketEligibilityResponse_t`.
    #[napi(object)]
    pub struct MarketEligibility {
        /// Whether the user may use the Community Market.
        pub allowed: bool,
        /// Bit flags of the reasons the user may not use the Market (SDK `EMarketNotAllowedReasonFlags`), `0` when allowed. Bit values: 1 temporary failure, 2 account disabled, 4 account locked down, 8 account limited, 16 trade banned, 32 account not trusted, 64 Steam Guard not enabled, 128 Steam Guard only recently enabled, 256 recent password reset, 512 new payment method, 1024 invalid cookie, 2048 using a new device, 4096 recent self refund, 8192 new payment method cannot be verified, 16384 no recent purchases, 32768 accepted wallet gift.
        pub not_allowed_reasons: u32,
        /// The time from which the user may use the Market, as the SDK's `RTime32` in seconds. The header names only the type, so the epoch is unverified against a live Steam client.
        pub allowed_at_time: u32,
        /// Days of Steam Guard the user must have had before using the Market.
        pub steam_guard_required_days: i32,
        /// Days after first authorizing a device before the user may use the Market on that device.
        pub new_device_cooldown_days: i32,
    }

    impl From<SteamMarketEligibility> for MarketEligibility {
        fn from(eligibility: SteamMarketEligibility) -> Self {
            Self {
                allowed: eligibility.allowed,
                not_allowed_reasons: eligibility.not_allowed_reasons.bits(),
                allowed_at_time: eligibility.allowed_at_time,
                steam_guard_required_days: eligibility.steam_guard_required_days,
                new_device_cooldown_days: eligibility.new_device_cooldown_days,
            }
        }
    }

    /// Duration control (playtime limit) status of the logged-in user, from Steam's `DurationControl_t`.
    #[napi(object)]
    pub struct DurationControl {
        /// The app that generated the playtime.
        pub app_id: u32,
        /// Whether duration control applies to this user and game.
        pub applicable: bool,
        /// Playtime since the most recent 5-hour gap, in seconds, counted up to the regulatory limit.
        pub seconds_last_5h: i32,
        /// The recommended progress.
        pub progress: DurationControlProgress,
        /// The notification to show, if any. Always `NoNotification` for this call.
        pub notification: DurationControlNotification,
        /// Playtime on the current calendar day, in seconds.
        pub seconds_today: i32,
        /// Playtime left before the user reaches a regulatory limit, in seconds.
        pub seconds_remaining: i32,
    }

    impl From<SteamDurationControl> for DurationControl {
        fn from(control: SteamDurationControl) -> Self {
            Self {
                app_id: control.app_id.0,
                applicable: control.applicable,
                seconds_last_5h: control.seconds_last_5h,
                progress: control.progress.into(),
                notification: control.notification.into(),
                seconds_today: control.seconds_today,
                seconds_remaining: control.seconds_remaining,
            }
        }
    }

    /// Returns the SteamID of the logged-in local user. Requires a running, logged-in Steam client.
    /// @returns `steamId64` as a BigInt, `steamId32` as a string, and `accountId`
    #[napi]
    pub fn get_steam_id() -> PlayerSteamId {
        let client = crate::client::get_client();
        let steam_id = client.user().steam_id();
        PlayerSteamId::from_steamid(steam_id)
    }

    /// Returns the Steam display name of the local user. Requires a running Steam client.
    /// @returns the persona name
    #[napi]
    pub fn get_name() -> String {
        let client = crate::client::get_client();
        client.friends().name()
    }

    /// Returns the Steam level of the local user. Requires a running Steam client.
    /// @returns the Steam level
    #[napi]
    pub fn get_level() -> u32 {
        let client = crate::client::get_client();
        client.user().level()
    }

    /// @returns the 2 digit ISO 3166-1-alpha-2 format country code which client is running in, e.g. "US" or "UK".
    #[napi]
    pub fn get_ip_country() -> String {
        let client = crate::client::get_client();
        client.utils().ip_country()
    }

    /// Sets one Rich Presence value for the local user, visible to friends.
    /// @param key - Rich Presence key
    /// @param value - value to set; `null` or omitted removes the key
    #[napi]
    pub fn set_rich_presence(key: String, value: Option<String>) {
        let client = crate::client::get_client();
        client.friends().set_rich_presence(&key, value.as_deref());
    }

    /// Returns the raw `HSteamUser` handle, the 32-bit value the SDK uses internally. Most code does not need it. Needs `init()`.
    /// @returns the handle as a number.
    #[napi]
    pub fn get_h_steam_user() -> i32 {
        crate::client::get_client().user().hsteam_user()
    }

    /// Reports a legacy usage event for a game to the Steam client. Needs `init()`. Only a few games use this call.
    /// This sends data to Steam. The SDK header does not list the event numbers, so `event` is passed through unchanged; the mapping is unverified against a live Steam client.
    /// Throws when `extraInfo` contains a NUL character, and then nothing is sent.
    /// @param gameId - the raw `CGameID` as a BigInt; for a game without mods it is the app id.
    /// @param event - the event number.
    /// @param extraInfo - optional text sent with the event; empty when omitted.
    #[napi]
    pub fn track_app_usage_event(
        game_id: BigInt,
        event: i32,
        extra_info: Option<String>,
    ) -> Result<(), Error> {
        let game_id = u64_from_bigint(game_id, "gameId")?;
        crate::client::get_client()
            .user()
            .track_app_usage_event(
                GameId::from_raw(game_id),
                event,
                extra_info.as_deref().unwrap_or(""),
            )
            .map_err(|_| Error::from_reason("extraInfo must not contain a NUL character"))
    }

    /// Returns the local folder that Steam provides for the current account's data for this app, such as save games and configs. Needs `init()`.
    /// @returns the folder path, or `null` when Steam returns none. The path form is the one in the SDK header: the Steam install folder, then `userdata`, the SteamID, the AppID and `local`, joined with the platform's path separator.
    #[napi]
    pub fn get_user_data_folder() -> Option<String> {
        crate::client::get_client().user().user_data_folder()
    }

    /// Starts capturing voice from the microphone. Read the captured audio with `getVoice()` at least once per frame. Needs `init()`.
    #[napi]
    pub fn start_voice_recording() {
        crate::client::get_client().user().start_voice_recording();
    }

    /// Stops capturing voice. Steam keeps recording for a short time after this call, so keep calling `getVoice()` until its result is `VoiceResult.NotRecording`.
    #[napi]
    pub fn stop_voice_recording() {
        crate::client::get_client().user().stop_voice_recording();
    }

    /// Returns how many bytes of compressed voice data `getVoice()` can return now. Only compressed audio is used; the SDK's uncompressed (deprecated) output is never requested. Needs `init()`.
    /// @returns `result`, and `compressedBytes`, which is `0` when the result is not `Ok`.
    #[napi]
    pub fn get_available_voice() -> VoiceAvailable {
        match crate::client::get_client().user().available_voice() {
            Ok(compressed_bytes) => VoiceAvailable {
                result: VoiceResult::Ok,
                compressed_bytes,
            },
            Err(result) => VoiceAvailable {
                result: result.into(),
                compressed_bytes: 0,
            },
        }
    }

    /// Reads the compressed voice data captured since the last call. The buffer is sized from `getAvailableVoice()`, so the call returns what is available now. Needs `init()`.
    /// Resolves with `result` and `data`. When `getAvailableVoice()` reports a result other than `Ok`, that result is returned with empty data. Throws only if the captured data is larger than 4 GB.
    /// @returns `result`, and `data`, a Buffer of compressed bytes.
    #[napi]
    pub fn get_voice() -> Result<VoiceChunk, Error> {
        let client = crate::client::get_client();
        let size = match client.user().available_voice() {
            Ok(size) => size as usize,
            Err(result) => {
                return Ok(VoiceChunk {
                    result: result.into(),
                    data: Vec::new().into(),
                })
            }
        };
        let mut buffer = vec![0u8; size];
        let (result, written) = client
            .user()
            .get_voice(&mut buffer)
            .map_err(|_| Error::from_reason("the captured voice data is larger than 4 GB"))?;
        buffer.truncate(written);
        Ok(VoiceChunk {
            result: result.into(),
            data: buffer.into(),
        })
    }

    /// Decodes compressed voice data from `getVoice()` into raw single-channel 16-bit PCM. Needs `init()`.
    /// The output buffer starts at 20 KB and is enlarged once when Steam asks for more room. The SDK supports sample rates from 11025 to 48000.
    /// Throws when the input is larger than 4 GB.
    /// @param compressed - the compressed voice bytes.
    /// @param sampleRate - the output sample rate; `getVoiceOptimalSampleRate()` returns the decoder's native rate.
    /// @returns `result`, and `data`, the decoded PCM bytes. The data is empty unless `result` is `Ok`.
    #[napi]
    pub fn decompress_voice(compressed: Buffer, sample_rate: u32) -> Result<VoiceChunk, Error> {
        const FIRST_BUFFER: usize = 20 * 1024;
        let client = crate::client::get_client();
        let decode = |size: usize| -> Result<(SteamVoiceResult, usize, Vec<u8>), Error> {
            let mut buffer = vec![0u8; size];
            let (result, written) = client
                .user()
                .decompress_voice(&compressed, sample_rate, &mut buffer)
                .map_err(|_| Error::from_reason("the compressed voice data is larger than 4 GB"))?;
            Ok((result, written, buffer))
        };
        let (mut result, mut written, mut buffer) = decode(FIRST_BUFFER)?;
        if result == SteamVoiceResult::BufferTooSmall && written > FIRST_BUFFER {
            (result, written, buffer) = decode(written)?;
        }
        buffer.truncate(written);
        Ok(VoiceChunk {
            result: result.into(),
            data: buffer.into(),
        })
    }

    /// Returns the native sample rate of the Steam voice decoder. Decoding at this rate does the least work; your audio output's own rate (often 44100 or 48000) can sound better. Needs `init()`.
    /// @returns the sample rate in Hz.
    #[napi]
    pub fn get_voice_optimal_sample_rate() -> u32 {
        crate::client::get_client()
            .user()
            .voice_optimal_sample_rate()
    }

    /// Returns whether Steam thinks the logged-in user is behind a NAT device. Needs a connection to Steam (a `SteamServersConnected` callback has fired) and may not detect every form of NAT.
    /// @returns true if Steam reports NAT, otherwise false.
    #[napi]
    pub fn is_behind_nat() -> bool {
        crate::client::get_client().user().is_behind_nat()
    }

    /// Publishes a game server's address so friends can join this game. Steam replicates the data to friends. Needs `init()`.
    /// This sends data to Steam. `ip` is passed as the 32-bit value of the IPv4 address (first octet in the highest byte). The header does not say which byte order the SDK expects, so this mapping is unverified against a live Steam client.
    /// Throws when `gameServerSteamId` is not a valid BigInt or `ip` is not an IPv4 address.
    /// @param gameServerSteamId - the game server's SteamID as a BigInt.
    /// @param ip - the IPv4 address of the game server, such as "192.168.1.10".
    /// @param port - the game server's port.
    #[napi]
    pub fn advertise_game(
        game_server_steam_id: BigInt,
        ip: String,
        port: u16,
    ) -> Result<(), Error> {
        let game_server_steam_id = u64_from_bigint(game_server_steam_id, "gameServerSteamId")?;
        let address: Ipv4Addr = ip
            .parse()
            .map_err(|e| Error::from_reason(format!("ip must be an IPv4 address: {e}")))?;
        crate::client::get_client().user().advertise_game(
            SteamId::from_raw(game_server_steam_id),
            u32::from(address),
            port,
        );
        Ok(())
    }

    /// Returns the logged-in user's trading-card badge level for a series. Needs `init()`.
    /// The regular badge has a maximum level of 5 and the foil badge a maximum of 1 (from the SDK header). The header does not say which value means "no badge", so the value is passed through unverified.
    /// @param series - the card series number.
    /// @param foil - true for the foil badge, false for the regular badge.
    /// @returns the badge level as the SDK reports it.
    #[napi]
    pub fn get_game_badge_level(series: i32, foil: bool) -> i32 {
        crate::client::get_client()
            .user()
            .game_badge_level(series, foil)
    }

    /// Returns whether the logged-in user's phone number is verified. Needs `init()`.
    /// @returns true if verified, otherwise false.
    #[napi]
    pub fn is_phone_verified() -> bool {
        crate::client::get_client().user().is_phone_verified()
    }

    /// Returns whether the logged-in user has two-factor authentication enabled. Needs `init()`.
    /// @returns true if enabled, otherwise false.
    #[napi]
    pub fn is_two_factor_enabled() -> bool {
        crate::client::get_client().user().is_two_factor_enabled()
    }

    /// Returns whether the logged-in user's phone number is an identifying one. Needs `init()`.
    /// @returns true if identifying, otherwise false.
    #[napi]
    pub fn is_phone_identifying() -> bool {
        crate::client::get_client().user().is_phone_identifying()
    }

    /// Returns whether the logged-in user's phone number is waiting for (re)verification. Needs `init()`.
    /// @returns true if verification is required, otherwise false.
    #[napi]
    pub fn is_phone_requiring_verification() -> bool {
        crate::client::get_client()
            .user()
            .is_phone_requiring_verification()
    }

    /// Asks Steam whether the logged-in user may use the Community Market. Needs `init()`. Resolves once Steam has answered;
    /// the answer is driven by `runCallbacks()`, which `init()` already calls.
    /// There is no timeout: if Steam never answers, the Promise stays pending.
    /// @returns the eligibility, including the reason flags and the cooldown fields.
    #[napi]
    pub async fn get_market_eligibility() -> Result<MarketEligibility, Error> {
        let (tx, rx) = oneshot::channel();
        crate::client::get_client()
            .user()
            .get_market_eligibility(move |result| {
                let _ = tx.send(result);
            });
        let eligibility = await_completion(rx, "reading the Community Market eligibility").await?;
        Ok(eligibility.into())
    }

    /// Asks Steam for the duration control (playtime limit) status of the logged-in user. Needs `init()`. Resolves once Steam has answered;
    /// the answer is driven by `runCallbacks()`, which `init()` already calls.
    /// Rejects when Steam reports an error. There is no timeout: if Steam never answers, the Promise stays pending. The `progress` and `notification` values can be deprecated ones (see their enums).
    /// @returns the duration control status for the current app.
    #[napi]
    pub async fn get_duration_control() -> Result<DurationControl, Error> {
        let (tx, rx) = oneshot::channel();
        crate::client::get_client()
            .user()
            .get_duration_control(move |result| {
                let _ = tx.send(result);
            });
        let control = await_completion(rx, "reading the duration control status").await?;
        Ok(control.into())
    }

    /// Tells Steam's duration control system whether the game is in offline or online play. Offline play does not count against the playtime limits. Needs `init()`.
    /// This sends the state to Steam.
    /// @param state - the current online state of the game.
    /// @returns true if the SDK accepted the state, otherwise false.
    #[napi]
    pub fn set_duration_control_online_state(state: DurationControlOnlineState) -> bool {
        crate::client::get_client()
            .user()
            .set_duration_control_online_state(state.into())
    }
}
