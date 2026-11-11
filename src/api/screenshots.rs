use napi_derive::napi;

#[napi]
pub mod screenshots {
    use napi::bindgen_prelude::Error;
    use std::path::Path;
    use steamworks::screenshots::ScreenshotLibraryAddError;

    /// Turns the Steam screenshot hotkey into a `ScreenshotRequested` callback, so the game takes the screenshot itself.
    #[napi]
    pub fn hook_screenshots(hook: bool) {
        let client = crate::client::get_client();
        client.screenshots().hook_screenshots(hook);
    }

    #[napi]
    pub fn is_screenshots_hooked() -> bool {
        let client = crate::client::get_client();
        client.screenshots().is_screenshots_hooked()
    }

    /// Triggers a screenshot, the same as the player pressing the screenshot hotkey.
    #[napi]
    pub fn trigger_screenshot() {
        let client = crate::client::get_client();
        client.screenshots().trigger_screenshot();
    }

    /// Adds an image file to the Steam screenshot library.
    /// @returns the screenshot handle, which `ScreenshotReady` also reports
    #[napi]
    pub fn add_screenshot_to_library(
        filename: String,
        thumbnail_filename: Option<String>,
        width: i32,
        height: i32,
    ) -> Result<u32, Error> {
        if filename.contains('\0')
            || thumbnail_filename
                .as_deref()
                .is_some_and(|thumbnail| thumbnail.contains('\0'))
        {
            return Err(Error::from_reason(
                "the screenshot path must not contain a NUL character",
            ));
        }
        let client = crate::client::get_client();
        client
            .screenshots()
            .add_screenshot_to_library(
                Path::new(&filename),
                thumbnail_filename.as_deref().map(Path::new),
                width,
                height,
            )
            .map_err(|error| match error {
                ScreenshotLibraryAddError::InvalidPath => Error::from_reason(format!(
                    "the screenshot path is invalid or the file cannot be read: {filename}"
                )),
                ScreenshotLibraryAddError::SavingFailed => {
                    Error::from_reason("Steam could not save the screenshot to the library")
                }
            })
    }
}
