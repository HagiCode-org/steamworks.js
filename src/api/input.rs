use napi_derive::napi;

#[napi]
pub mod input {
    use napi::bindgen_prelude::BigInt;

    #[napi(string_enum)]
    pub enum InputType {
        Unknown,
        SteamController,
        XBox360Controller,
        XBoxOneController,
        GenericGamepad,
        PS4Controller,
        AppleMFiController,
        AndroidController,
        SwitchJoyConPair,
        SwitchJoyConSingle,
        SwitchProController,
        MobileTouch,
        PS3Controller,
        PS5Controller,
        SteamDeckController,
    }

    impl From<steamworks::InputType> for InputType {
        fn from(input_type: steamworks::InputType) -> InputType {
            match input_type {
                steamworks::InputType::Unknown => InputType::Unknown,
                steamworks::InputType::SteamController => InputType::SteamController,
                steamworks::InputType::XBox360Controller => InputType::XBox360Controller,
                steamworks::InputType::XBoxOneController => InputType::XBoxOneController,
                steamworks::InputType::GenericGamepad => InputType::GenericGamepad,
                steamworks::InputType::PS4Controller => InputType::PS4Controller,
                steamworks::InputType::AppleMFiController => InputType::AppleMFiController,
                steamworks::InputType::AndroidController => InputType::AndroidController,
                steamworks::InputType::SwitchJoyConPair => InputType::SwitchJoyConPair,
                steamworks::InputType::SwitchJoyConSingle => InputType::SwitchJoyConSingle,
                steamworks::InputType::SwitchProController => InputType::SwitchProController,
                steamworks::InputType::MobileTouch => InputType::MobileTouch,
                steamworks::InputType::PS3Controller => InputType::PS3Controller,
                steamworks::InputType::PS5Controller => InputType::PS5Controller,
                steamworks::InputType::SteamDeckController => InputType::SteamDeckController,
            }
        }
    }

    #[napi]
    pub struct Controller {
        pub(crate) handle: BigInt,
    }

    #[napi]
    impl Controller {
        #[napi]
        pub fn activate_action_set(&self, action_set_handle: BigInt) {
            let client = crate::client::get_client();
            client
                .input()
                .activate_action_set_handle(self.handle.get_u64().1, action_set_handle.get_u64().1)
        }

        #[napi]
        pub fn is_digital_action_pressed(&self, action_handle: BigInt) -> bool {
            let client = crate::client::get_client();
            client
                .input()
                .get_digital_action_data(self.handle.get_u64().1, action_handle.get_u64().1)
                .bState
        }

        #[napi]
        pub fn get_analog_action_vector(&self, action_handle: BigInt) -> AnalogActionVector {
            let client = crate::client::get_client();
            let data = client
                .input()
                .get_analog_action_data(self.handle.get_u64().1, action_handle.get_u64().1);
            AnalogActionVector {
                x: data.x as f64,
                y: data.y as f64,
            }
        }

        #[napi]
        pub fn get_type(&self) -> InputType {
            let client = crate::client::get_client();
            client
                .input()
                .get_input_type_for_handle(self.handle.get_u64().1)
                .into()
        }

        #[napi]
        pub fn get_handle(&self) -> BigInt {
            self.handle.clone()
        }
    }

    #[napi(object)]
    pub struct AnalogActionVector {
        pub x: f64,
        pub y: f64,
    }

    #[napi]
    pub fn init() {
        let client = crate::client::get_client();
        client.input().init(false);
    }

    #[napi]
    pub fn get_controllers() -> Vec<Controller> {
        let client = crate::client::get_client();
        client
            .input()
            .get_connected_controllers()
            .into_iter()
            .map(|identity| Controller {
                handle: BigInt::from(identity),
            })
            .collect()
    }

    #[napi]
    pub fn get_action_set(action_set_name: String) -> BigInt {
        let client = crate::client::get_client();
        BigInt::from(client.input().get_action_set_handle(&action_set_name))
    }

    #[napi]
    pub fn get_digital_action(action_name: String) -> BigInt {
        let client = crate::client::get_client();
        BigInt::from(client.input().get_digital_action_handle(&action_name))
    }

    #[napi]
    pub fn get_analog_action(action_name: String) -> BigInt {
        let client = crate::client::get_client();
        BigInt::from(client.input().get_analog_action_handle(&action_name))
    }

    #[napi]
    pub fn shutdown() {
        let client = crate::client::get_client();
        client.input().shutdown()
    }

    #[napi(object)]
    pub struct DigitalActionData {
        /// `true` while the digital action is pressed.
        pub state: bool,
        /// `false` when the action is not available for this controller.
        pub active: bool,
    }

    #[napi(object)]
    pub struct AnalogActionData {
        pub x: f64,
        pub y: f64,
        /// `false` when the action is not available for this controller.
        pub active: bool,
    }

    /// @param controllerHandle - a controller handle from `getConnectedControllers`
    /// @param actionHandle - a digital action handle from `getDigitalAction`
    #[napi]
    pub fn get_digital_action_data(
        controller_handle: BigInt,
        action_handle: BigInt,
    ) -> DigitalActionData {
        let client = crate::client::get_client();
        let data = client
            .input()
            .get_digital_action_data(controller_handle.get_u64().1, action_handle.get_u64().1);
        DigitalActionData {
            state: data.bState,
            active: data.bActive,
        }
    }

    /// @param actionHandle - an analog action handle from `getAnalogAction`
    #[napi]
    pub fn get_analog_action_data(
        controller_handle: BigInt,
        action_handle: BigInt,
    ) -> AnalogActionData {
        let client = crate::client::get_client();
        let data = client
            .input()
            .get_analog_action_data(controller_handle.get_u64().1, action_handle.get_u64().1);
        AnalogActionData {
            x: f64::from(data.x),
            y: f64::from(data.y),
            active: data.bActive,
        }
    }

    /// @returns the Steam action origins (numeric `EInputActionOrigin` values) bound to a digital action; empty when unbound
    #[napi]
    pub fn get_digital_action_origins(
        controller_handle: BigInt,
        action_set_handle: BigInt,
        action_handle: BigInt,
    ) -> Vec<u32> {
        let client = crate::client::get_client();
        client
            .input()
            .get_digital_action_origins(
                controller_handle.get_u64().1,
                action_set_handle.get_u64().1,
                action_handle.get_u64().1,
            )
            .into_iter()
            .map(|origin| origin as u32)
            .collect()
    }

    /// @returns the Steam action origins (numeric `EInputActionOrigin` values) bound to an analog action; empty when unbound
    #[napi]
    pub fn get_analog_action_origins(
        controller_handle: BigInt,
        action_set_handle: BigInt,
        action_handle: BigInt,
    ) -> Vec<u32> {
        let client = crate::client::get_client();
        client
            .input()
            .get_analog_action_origins(
                controller_handle.get_u64().1,
                action_set_handle.get_u64().1,
                action_handle.get_u64().1,
            )
            .into_iter()
            .map(|origin| origin as u32)
            .collect()
    }

    /// Steam's `EInputActionOrigin` is `#[non_exhaustive]`; discriminants 0 to 410 are its contiguous variants.
    /// Values outside that range are not origins and are rejected rather than transmuted.
    fn origin_from_u32(origin: u32) -> Option<steamworks::sys::EInputActionOrigin> {
        if origin <= 410 {
            // SAFETY: every value in 0..=410 is a discriminant of EInputActionOrigin (checked against the Steam headers).
            Some(unsafe { std::mem::transmute::<u32, steamworks::sys::EInputActionOrigin>(origin) })
        } else {
            None
        }
    }

    /// @returns the display name of an action origin, such as "A Button"; empty for an unknown origin
    #[napi]
    pub fn get_string_for_action_origin(origin: u32) -> String {
        let Some(origin) = origin_from_u32(origin) else {
            return String::new();
        };
        let client = crate::client::get_client();
        client.input().get_string_for_action_origin(origin)
    }

    /// @returns the glyph image path of an action origin
    #[napi]
    pub fn get_glyph_for_action_origin(origin: u32) -> String {
        let Some(origin) = origin_from_u32(origin) else {
            return String::new();
        };
        let client = crate::client::get_client();
        client.input().get_glyph_for_action_origin(origin)
    }
}
