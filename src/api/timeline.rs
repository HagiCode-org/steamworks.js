use napi_derive::napi;

#[napi]
pub mod timeline {
    use crate::api::networking_utils::networking_utils::steam_client;
    use napi::bindgen_prelude::{BigInt, Error};
    use napi::{Env, JsObject};
    use std::time::Duration;
    use tokio::sync::oneshot;

    #[napi]
    pub enum TimelineGameMode {
        Playing,
        Staging,
        Menus,
        LoadingScreen,
    }

    #[napi]
    pub enum TimelineEventClipPriority {
        None,
        Standard,
        Featured,
    }

    impl From<TimelineGameMode> for steamworks::TimelineGameMode {
        fn from(mode: TimelineGameMode) -> Self {
            match mode {
                TimelineGameMode::Playing => steamworks::TimelineGameMode::Playing,
                TimelineGameMode::Staging => steamworks::TimelineGameMode::Staging,
                TimelineGameMode::Menus => steamworks::TimelineGameMode::Menus,
                TimelineGameMode::LoadingScreen => steamworks::TimelineGameMode::LoadingScreen,
            }
        }
    }

    impl From<TimelineEventClipPriority> for steamworks::TimelineEventClipPriority {
        fn from(priority: TimelineEventClipPriority) -> Self {
            match priority {
                TimelineEventClipPriority::None => steamworks::TimelineEventClipPriority::None,
                TimelineEventClipPriority::Standard => {
                    steamworks::TimelineEventClipPriority::Standard
                }
                TimelineEventClipPriority::Featured => {
                    steamworks::TimelineEventClipPriority::Featured
                }
            }
        }
    }

    fn check_text(value: &str, field: &str) -> Result<(), Error> {
        if value.contains('\0') {
            return Err(Error::from_reason(format!(
                "{field} must not contain a NUL character"
            )));
        }
        Ok(())
    }

    fn seconds(value: f64, field: &str) -> Result<Duration, Error> {
        match Duration::try_from_secs_f64(value) {
            Ok(duration) if value.is_finite() => Ok(duration),
            _ => Err(Error::from_reason(format!(
                "{field} must be a finite, non-negative number of seconds"
            ))),
        }
    }

    /// Sets the game mode shown on the Steam timeline.
    #[napi]
    pub fn set_game_mode(mode: TimelineGameMode) {
        let client = crate::client::get_client();
        client.timeline().set_timeline_game_mode(mode.into());
    }

    /// Shows a state description on the timeline for `durationSeconds`. An empty description is allowed.
    #[napi]
    pub fn set_state_description(description: String, duration_seconds: f64) -> Result<(), Error> {
        check_text(&description, "description")?;
        let duration = seconds(duration_seconds, "durationSeconds")?;
        let client = crate::client::get_client();
        client
            .timeline()
            .set_timeline_state_description(&description, duration);
        Ok(())
    }

    /// Clears the state description after `durationSeconds`.
    #[napi]
    pub fn clear_state_description(duration_seconds: f64) -> Result<(), Error> {
        let duration = seconds(duration_seconds, "durationSeconds")?;
        let client = crate::client::get_client();
        client.timeline().clear_timeline_state_description(duration);
        Ok(())
    }

    /// Marks an event on the timeline.
    /// @param startOffsetSeconds - seconds from now at which the event starts (may be negative)
    /// @param durationSeconds - how long the event lasts, must not be negative
    #[napi]
    pub fn add_event(
        icon: String,
        title: String,
        description: String,
        priority: u32,
        start_offset_seconds: f64,
        duration_seconds: f64,
        clip_priority: TimelineEventClipPriority,
    ) -> Result<(), Error> {
        check_text(&icon, "icon")?;
        check_text(&title, "title")?;
        check_text(&description, "description")?;
        if !start_offset_seconds.is_finite() {
            return Err(Error::from_reason(
                "startOffsetSeconds must be a finite number",
            ));
        }
        let duration = seconds(duration_seconds, "durationSeconds")?;
        let client = crate::client::get_client();
        client.timeline().add_timeline_event(
            &icon,
            &title,
            &description,
            priority,
            start_offset_seconds as f32,
            duration,
            clip_priority.into(),
        );
        Ok(())
    }

    /// Result of `doesEventRecordingExist()`.
    #[napi(object)]
    pub struct EventRecordingExists {
        /// The event handle that was asked about.
        pub event: BigInt,
        /// `true` when a background recording covers the event.
        pub recording_exists: bool,
    }

    /// Result of `doesGamePhaseRecordingExist()`.
    #[napi(object)]
    pub struct GamePhaseRecordingExists {
        /// The phase ID, as Steam returns it.
        pub phase_id: String,
        /// Length in milliseconds of the background recording covering the phase.
        pub recording_ms: f64,
        /// Length in milliseconds of the longest clip made from the phase.
        pub longest_clip_ms: f64,
        /// Number of clips made from the phase.
        pub clip_count: u32,
        /// Number of screenshots taken during the phase.
        pub screenshot_count: u32,
    }

    /// Longest game phase ID in bytes. Steam's limit is 64 bytes including the terminating NUL.
    const MAX_PHASE_ID_BYTES: usize = 63;

    fn timeline() -> Result<steamworks::Timeline, Error> {
        Ok(steam_client()?.timeline())
    }

    /// Reads a timeline event handle. Handles are BigInts so values above 2^53 stay exact.
    fn event_handle(event: BigInt) -> Result<u64, Error> {
        let (negative, value, lossless) = event.get_u64();
        if lossless && !negative {
            Ok(value)
        } else {
            Err(Error::from_reason(
                "event must be a timeline event handle (a BigInt returned by addInstantaneousTimelineEvent or startRangeTimelineEvent)",
            ))
        }
    }

    fn check_phase_id(phase_id: &str) -> Result<(), Error> {
        check_text(phase_id, "phaseId")?;
        if phase_id.len() > MAX_PHASE_ID_BYTES {
            return Err(Error::from_reason(format!(
                "phaseId must be at most {MAX_PHASE_ID_BYTES} bytes"
            )));
        }
        Ok(())
    }

    /// Adds an event that happens at one moment on the Steam timeline. Needs `init()`.
    /// @param title - Title shown on the timeline, in the language from `getUiLanguage()`.
    /// @param description - Description shown on the timeline, in the same language.
    /// @param icon - Name of an icon uploaded for the app, or a built-in `steam_` icon.
    /// @param iconPriority - Priority of the icon. Higher values are shown first.
    /// @param startOffsetSeconds - Seconds from now at which the event happens. Negative for the past.
    /// @param clipPriority - Whether the event makes a clip, and how important it is.
    /// @returns The event handle, or `null` when the timeline is unavailable. Throws when a text contains a NUL character or the offset is not finite.
    #[napi]
    pub fn add_instantaneous_timeline_event(
        title: String,
        description: String,
        icon: String,
        icon_priority: u32,
        start_offset_seconds: f64,
        clip_priority: TimelineEventClipPriority,
    ) -> Result<Option<BigInt>, Error> {
        check_text(&title, "title")?;
        check_text(&description, "description")?;
        check_text(&icon, "icon")?;
        if !start_offset_seconds.is_finite() {
            return Err(Error::from_reason(
                "startOffsetSeconds must be a finite number",
            ));
        }
        Ok(timeline()?
            .add_instantaneous_timeline_event(
                &title,
                &description,
                &icon,
                icon_priority,
                start_offset_seconds as f32,
                clip_priority.into(),
            )
            .map(BigInt::from))
    }

    /// Starts a range event now (plus `startOffsetSeconds`). It lasts until `endRangeTimelineEvent()`. Needs `init()`.
    /// Steam discards range events that are still open when the game exits.
    /// @param title - Title shown on the timeline.
    /// @param description - Description shown on the timeline.
    /// @param icon - Name of an icon uploaded for the app, or a built-in `steam_` icon.
    /// @param priority - Priority of the event.
    /// @param startOffsetSeconds - Seconds from now at which the event starts. Negative for the past.
    /// @param clipPriority - Whether the event makes a clip, and how important it is.
    /// @returns The event handle, or `null` when the timeline is unavailable. Throws when a text contains a NUL character or the offset is not finite.
    #[napi]
    pub fn start_range_timeline_event(
        title: String,
        description: String,
        icon: String,
        priority: u32,
        start_offset_seconds: f64,
        clip_priority: TimelineEventClipPriority,
    ) -> Result<Option<BigInt>, Error> {
        check_text(&title, "title")?;
        check_text(&description, "description")?;
        check_text(&icon, "icon")?;
        if !start_offset_seconds.is_finite() {
            return Err(Error::from_reason(
                "startOffsetSeconds must be a finite number",
            ));
        }
        Ok(timeline()?
            .start_range_timeline_event(
                &title,
                &description,
                &icon,
                priority,
                start_offset_seconds as f32,
                clip_priority.into(),
            )
            .map(BigInt::from))
    }

    /// Changes the fields of a range event that has started and not ended. Needs `init()`.
    /// Does nothing when the timeline is unavailable. Throws when the handle is not a BigInt from this API or a text contains a NUL character.
    /// @param event - The handle from `startRangeTimelineEvent()`.
    #[napi]
    pub fn update_range_timeline_event(
        event: BigInt,
        title: String,
        description: String,
        icon: String,
        priority: u32,
        clip_priority: TimelineEventClipPriority,
    ) -> Result<(), Error> {
        let event = event_handle(event)?;
        check_text(&title, "title")?;
        check_text(&description, "description")?;
        check_text(&icon, "icon")?;
        timeline()?
            .update_range_timeline_event(
                event,
                &title,
                &description,
                &icon,
                priority,
                clip_priority.into(),
            )
            .map_err(|()| Error::from_reason("a text contains a NUL character"))
    }

    /// Ends a range event, `endOffsetSeconds` from now, and shows it on the timeline. Needs `init()`.
    /// Does nothing when the timeline is unavailable. Throws when the handle is not valid or the offset is not finite.
    /// @param event - The handle from `startRangeTimelineEvent()`.
    /// @param endOffsetSeconds - Seconds from now at which the event ends. Negative for the past.
    #[napi]
    pub fn end_range_timeline_event(event: BigInt, end_offset_seconds: f64) -> Result<(), Error> {
        let event = event_handle(event)?;
        if !end_offset_seconds.is_finite() {
            return Err(Error::from_reason(
                "endOffsetSeconds must be a finite number",
            ));
        }
        timeline()?.end_range_timeline_event(event, end_offset_seconds as f32);
        Ok(())
    }

    /// Removes an event from the timeline. Works for instantaneous and range events. Needs `init()`.
    /// Does nothing when the timeline is unavailable. Throws when the handle is not valid.
    /// @param event - The event handle.
    #[napi]
    pub fn remove_timeline_event(event: BigInt) -> Result<(), Error> {
        let event = event_handle(event)?;
        timeline()?.remove_timeline_event(event);
        Ok(())
    }

    /// Asks whether a background recording covers an event. Needs `init()`.
    /// The promise resolves when Steam answers, which happens during `runCallbacks()`, so keep calling it while the promise is pending.
    /// @param event - The event handle.
    /// @returns The answer, with the handle again. Rejects when the timeline is unavailable or Steam cannot answer (for example a disk I/O failure).
    #[napi(ts_return_type = "Promise<EventRecordingExists>")]
    pub fn does_event_recording_exist(env: Env, event: BigInt) -> napi::Result<JsObject> {
        let event = event_handle(event)?;
        let (tx, rx) = oneshot::channel::<Result<EventRecordingExists, String>>();
        timeline()?.does_event_recording_exist(event, move |result| {
            let _ = tx.send(match result {
                Ok(answer) => Ok(EventRecordingExists {
                    event: BigInt::from(answer.event),
                    recording_exists: answer.recording_exists,
                }),
                Err(err) => Err(format!("Steam could not check the event recording: {err}")),
            });
        });
        env.spawn_future(async move {
            let outcome = rx.await.map_err(|_| {
                Error::from_reason("The timeline answer was not received before the check ended.")
            })?;
            outcome.map_err(Error::from_reason)
        })
    }

    /// Starts a game phase, which ends the previous one. A phase is a stretch of play of about 10 minutes to a few hours, such as one match or one chapter. Needs `init()`.
    /// Does nothing when the timeline is unavailable.
    #[napi]
    pub fn start_game_phase() -> Result<(), Error> {
        timeline()?.start_game_phase();
        Ok(())
    }

    /// Ends the current game phase. Needs `init()`. Does nothing when the timeline is unavailable.
    #[napi]
    pub fn end_game_phase() -> Result<(), Error> {
        timeline()?.end_game_phase();
        Ok(())
    }

    /// Sets the ID of the current game phase, so `openOverlayToGamePhase()` and `doesGamePhaseRecordingExist()` can find it. Needs `init()`.
    /// Does nothing when the timeline is unavailable. Throws when the ID is longer than 63 bytes or contains a NUL character.
    /// @param phaseId - The phase ID. Use a stable value you can look up later.
    #[napi]
    pub fn set_game_phase_id(phase_id: String) -> Result<(), Error> {
        check_phase_id(&phase_id)?;
        timeline()?
            .set_game_phase_id(&phase_id)
            .map_err(|()| Error::from_reason("phaseId is not valid"))
    }

    /// Asks whether a background recording covers a game phase. Needs `init()`.
    /// The promise resolves when Steam answers, which happens during `runCallbacks()`, so keep calling it while the promise is pending.
    /// @param phaseId - The phase ID set with `setGamePhaseId()`.
    /// @returns The recording and clip lengths in milliseconds, and the clip and screenshot counts. Rejects when the timeline is unavailable, the ID is not valid, or Steam cannot answer.
    #[napi(ts_return_type = "Promise<GamePhaseRecordingExists>")]
    pub fn does_game_phase_recording_exist(env: Env, phase_id: String) -> napi::Result<JsObject> {
        check_phase_id(&phase_id)?;
        let (tx, rx) = oneshot::channel::<Result<GamePhaseRecordingExists, String>>();
        timeline()?.does_game_phase_recording_exist(&phase_id, move |result| {
            let _ = tx.send(match result {
                Ok(answer) => Ok(GamePhaseRecordingExists {
                    phase_id: answer.phase_id,
                    recording_ms: answer.recording_ms as f64,
                    longest_clip_ms: answer.longest_clip_ms as f64,
                    clip_count: answer.clip_count,
                    screenshot_count: answer.screenshot_count,
                }),
                Err(err) => Err(format!(
                    "Steam could not check the game phase recording: {err}"
                )),
            });
        });
        env.spawn_future(async move {
            let outcome = rx.await.map_err(|_| {
                Error::from_reason("The timeline answer was not received before the check ended.")
            })?;
            outcome.map_err(Error::from_reason)
        })
    }

    /// Adds a tag that applies to the whole current game phase. Several tags of one group are all kept. Needs `init()`.
    /// Does nothing when the timeline is unavailable. Throws when a text contains a NUL character.
    /// @param tagName - Localized tag text.
    /// @param tagIcon - Name of an icon.
    /// @param tagGroup - Localized group name the tag belongs to.
    /// @param priority - Priority of the tag.
    #[napi]
    pub fn add_game_phase_tag(
        tag_name: String,
        tag_icon: String,
        tag_group: String,
        priority: u32,
    ) -> Result<(), Error> {
        check_text(&tag_name, "tagName")?;
        check_text(&tag_icon, "tagIcon")?;
        check_text(&tag_group, "tagGroup")?;
        timeline()?
            .add_game_phase_tag(&tag_name, &tag_icon, &tag_group, priority)
            .map_err(|()| Error::from_reason("a text contains a NUL character"))
    }

    /// Sets a text attribute for the whole current game phase, such as a score. Only the last value set is shown. Needs `init()`.
    /// Does nothing when the timeline is unavailable. Throws when a text contains a NUL character.
    /// @param attributeGroup - Localized name of the attribute.
    /// @param attributeValue - The value to show.
    /// @param priority - Priority of the attribute.
    #[napi]
    pub fn set_game_phase_attribute(
        attribute_group: String,
        attribute_value: String,
        priority: u32,
    ) -> Result<(), Error> {
        check_text(&attribute_group, "attributeGroup")?;
        check_text(&attribute_value, "attributeValue")?;
        timeline()?
            .set_game_phase_attribute(&attribute_group, &attribute_value, priority)
            .map_err(|()| Error::from_reason("a text contains a NUL character"))
    }

    /// Opens the Steam overlay on a game phase that has an ID set with `setGamePhaseId()`. Needs `init()`.
    /// Does nothing when the timeline is unavailable. Throws when the ID is too long or contains a NUL character.
    /// @param phaseId - The phase ID.
    #[napi]
    pub fn open_overlay_to_game_phase(phase_id: String) -> Result<(), Error> {
        check_phase_id(&phase_id)?;
        timeline()?
            .open_overlay_to_game_phase(&phase_id)
            .map_err(|()| Error::from_reason("phaseId is not valid"))
    }

    /// Opens the Steam overlay on a timeline event. Needs `init()`.
    /// Does nothing when the timeline is unavailable. Throws when the handle is not valid.
    /// @param event - The event handle.
    #[napi]
    pub fn open_overlay_to_timeline_event(event: BigInt) -> Result<(), Error> {
        let event = event_handle(event)?;
        timeline()?.open_overlay_to_timeline_event(event);
        Ok(())
    }
}
