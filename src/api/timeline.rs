use napi_derive::napi;

#[napi]
pub mod timeline {
    use napi::bindgen_prelude::Error;
    use std::time::Duration;

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
}
