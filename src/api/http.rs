use napi_derive::napi;

/// Steam HTTP: requests sent through the Steam client.
///
/// Every request goes through the Steam client, so `init()` must have succeeded and the client must be running.
/// Whether HTTPS certificates are checked the same way as a browser's is unverified against a live Steam client.
#[napi]
pub mod http {
    use crate::api::networking_utils::networking_utils::steam_client;
    use napi::bindgen_prelude::{Buffer, ClassInstance, Error, ToNapiValue};
    use napi::{Env, JsObject};
    use std::collections::HashMap;
    use std::sync::Arc;
    use steamworks::{HttpCookieContainer, HttpMethod, HttpResponse as SteamHttpResponse};
    use tokio::sync::oneshot;

    /// Options for `request()`. Only `method` and `url` are required.
    #[napi(object)]
    pub struct RequestOptions {
        /// HTTP method: `GET`, `HEAD`, `POST`, `PUT`, `DELETE`, `OPTIONS` or `PATCH`, in any letter case.
        pub method: String,
        /// Absolute URL. It must start with `http://` or `https://`.
        pub url: String,
        /// Request headers, by name. Steam may reject a header name or value it does not accept.
        pub headers: Option<HashMap<String, String>>,
        /// GET parameters. Steam adds them to the URL for a `GET` request, and they are sent as form data for other methods.
        pub query: Option<HashMap<String, String>>,
        /// POST parameters, sent form-encoded. Steam sends them the same way as `query` for non-GET methods. Cannot be combined with `body`.
        pub form: Option<HashMap<String, String>>,
        /// Raw request body, for `POST` (and methods Steam accepts a body for). Cannot be combined with `form` or `query`.
        pub body: Option<Buffer>,
        /// `Content-Type` of `body`. Defaults to `application/octet-stream`, and is only allowed together with `body`.
        pub content_type: Option<String>,
        /// Total time limit for the request, in milliseconds. Unlike the network inactivity timeout, it does not reset when data arrives. Steam's default is no total limit.
        pub timeout_ms: Option<u32>,
        /// Text appended to the user agent. The normal user agent is kept.
        pub user_agent: Option<String>,
        /// Whether HTTPS certificates must be verified. Defaults to `true`. Turning it off is unverified against a live Steam client.
        pub require_verified_certificate: Option<bool>,
        /// Cookie container from `createCookieContainer()`, to send and store cookies with this request.
        pub cookie_container: Option<ClassInstance<CookieContainer>>,
        /// Names of the response headers to return in `headers`. Steam has no way to list all response headers, so name each one you need.
        pub response_headers: Option<Vec<String>>,
    }

    /// A completed request. `request()` resolves with it when the server answered, whatever the status code.
    #[napi(object)]
    pub struct HttpResponse {
        /// HTTP status code the server returned, for example `200` or `404`. Check it yourself: error statuses still resolve.
        pub status: u32,
        /// The headers named in `responseHeaders` that the response contains, with names as you wrote them.
        pub headers: HashMap<String, String>,
        /// Response body bytes. Empty for `HEAD` requests and for responses without a body.
        pub body: Buffer,
        /// `true` when the request timed out. A timeout normally rejects the promise instead, so this is `false` on a resolved response.
        pub was_timed_out: bool,
    }

    /// Response data as plain Rust values. It crosses from the Steam callback to the JS promise without holding a napi buffer.
    struct ResponseData {
        status: u32,
        headers: HashMap<String, String>,
        body: Vec<u8>,
        was_timed_out: bool,
    }

    impl ToNapiValue for ResponseData {
        unsafe fn to_napi_value(
            env: napi::sys::napi_env,
            value: Self,
        ) -> napi::Result<napi::sys::napi_value> {
            let response = HttpResponse {
                status: value.status,
                headers: value.headers,
                body: Buffer::from(value.body),
                was_timed_out: value.was_timed_out,
            };
            <HttpResponse as ToNapiValue>::to_napi_value(env, response)
        }
    }

    /// A cookie container for requests. Cookies stay in the Steam client for this process only and are not saved between runs.
    /// It is released when it is no longer referenced by JavaScript and no request is still using it.
    #[napi]
    pub struct CookieContainer {
        inner: Arc<HttpCookieContainer>,
    }

    #[napi]
    impl CookieContainer {
        /// Adds a cookie that requests using this container send to `url`. Needs `init()`.
        /// @param host - The host the cookie belongs to, for example `example.com`.
        /// @param url - The URL the cookie applies to, starting with `http://` or `https://`.
        /// @param cookie - A `Set-Cookie`-style value, for example `session=abc; Path=/`.
        /// @returns Throws when an argument contains a NUL character or Steam refuses the cookie.
        #[napi]
        pub fn set_cookie(&self, host: String, url: String, cookie: String) -> Result<(), Error> {
            self.inner.set_cookie(&host, &url, &cookie).map_err(|()| {
                Error::from_reason(
                    "Steam refused the cookie or an argument contains a NUL character",
                )
            })
        }
    }

    /// Creates a cookie container that requests can share. Needs `init()`.
    /// @param allowResponsesToModify - When `true`, responses to requests using the container may add cookies that are sent with later requests. When `false`, only cookies added with `setCookie()` are sent.
    /// @returns The new container. Throws when Steam returns no handle.
    #[napi]
    pub fn create_cookie_container(
        allow_responses_to_modify: bool,
    ) -> Result<CookieContainer, Error> {
        let client = steam_client()?;
        let container = client
            .http()
            .create_cookie_container(allow_responses_to_modify)
            .map_err(|()| Error::from_reason("Steam did not create a cookie container"))?;
        Ok(CookieContainer {
            inner: Arc::new(container),
        })
    }

    /// Sends an HTTP request through the Steam client and resolves with the response. Needs `init()`, and the Steam client must be running.
    /// The request is driven by `runCallbacks()`, so call it regularly while the promise is pending. The request handle is released on every path, including failures.
    ///
    /// The promise rejects when the request cannot be created or sent, when a header or option is refused, when Steam cannot complete the request, when no answer comes from the server, or when the request times out.
    /// It resolves for every answer the server gives, including error statuses such as 404 or 500.
    /// Requests are sent through the Steam client. Whether HTTPS validation behaves the same as in a browser is unverified against a live Steam client.
    /// @param options - The request. `method` and `url` are required.
    /// @returns The response with its status, the requested headers and the body.
    #[napi(ts_return_type = "Promise<HttpResponse>")]
    pub fn request(env: Env, options: RequestOptions) -> napi::Result<JsObject> {
        let pending = start_request(options);
        env.spawn_future(async move {
            let receiver = pending.map_err(Error::from_reason)?;
            let outcome = receiver.await.map_err(|_| {
                Error::from_reason(
                    "The HTTP response was not received; the outcome is unknown. Check the server before retrying.",
                )
            })?;
            outcome.map_err(Error::from_reason)
        })
    }

    /// Creates, configures and sends the request on the calling thread. Returns the receiver for its completion.
    /// Errors are plain strings, so they can cross to the promise task.
    fn start_request(
        options: RequestOptions,
    ) -> Result<oneshot::Receiver<Result<ResponseData, String>>, String> {
        let client = steam_client().map_err(|e| e.reason)?;
        let http = client.http();
        let method = parse_method(&options.method)?;
        let mut request = http
            .create_request(method, &options.url)
            .map_err(|()| format!("Steam could not create a {} request for {}; check the URL starts with http:// or https://", options.method, options.url))?;

        for (name, value) in options.headers.unwrap_or_default() {
            request = request
                .header(&name, &value)
                .map_err(|()| format!("Steam refused the header {name}"))?;
        }
        for (name, value) in options.query.unwrap_or_default() {
            request = request
                .get_or_post_parameter(&name, &value)
                .map_err(|()| format!("Steam refused the query parameter {name}"))?;
        }
        for (name, value) in options.form.unwrap_or_default() {
            request = request
                .get_or_post_parameter(&name, &value)
                .map_err(|()| format!("Steam refused the form field {name}"))?;
        }
        match options.body {
            Some(body) => {
                let content_type = options
                    .content_type
                    .unwrap_or_else(|| "application/octet-stream".to_owned());
                request = request
                    .raw_post_body(&content_type, body.as_ref())
                    .map_err(|()| "Steam refused the body; a body needs a POST request and cannot be combined with form or query parameters".to_owned())?;
            }
            None if options.content_type.is_some() => {
                return Err("contentType is only used together with body".to_owned());
            }
            None => {}
        }
        if let Some(timeout_ms) = options.timeout_ms {
            request = request.absolute_timeout(timeout_ms).map_err(|()| {
                "Steam refused timeoutMs; it must be set before the request is sent".to_owned()
            })?;
        }
        if let Some(info) = options.user_agent {
            request = request.user_agent_info(&info).map_err(|()| {
                "Steam refused userAgent or it contains a NUL character".to_owned()
            })?;
        }
        if let Some(required) = options.require_verified_certificate {
            request = request
                .requires_verified_certificate(required)
                .map_err(|()| "Steam refused requireVerifiedCertificate".to_owned())?;
        }
        if let Some(container) = options.cookie_container.as_ref() {
            request = request
                .cookie_container(&container.inner)
                .map_err(|()| "Steam refused the cookie container".to_owned())?;
        }

        let response_headers = options.response_headers.unwrap_or_default();
        let (tx, rx) = oneshot::channel();
        request
            .send(move |result| {
                let outcome = match result {
                    Ok(response) => read_response(&response, &response_headers),
                    Err(err) => Err(format!("Steam could not complete the request: {err}")),
                };
                let _ = tx.send(outcome);
            })
            .map_err(|()| "Steam refused to send the request".to_owned())?;
        Ok(rx)
    }

    fn parse_method(method: &str) -> Result<HttpMethod, String> {
        match method.to_ascii_uppercase().as_str() {
            "GET" => Ok(HttpMethod::Get),
            "HEAD" => Ok(HttpMethod::Head),
            "POST" => Ok(HttpMethod::Post),
            "PUT" => Ok(HttpMethod::Put),
            "DELETE" => Ok(HttpMethod::Delete),
            "OPTIONS" => Ok(HttpMethod::Options),
            "PATCH" => Ok(HttpMethod::Patch),
            _ => Err(format!(
                "unknown HTTP method {method}; use GET, HEAD, POST, PUT, DELETE, OPTIONS or PATCH"
            )),
        }
    }

    /// Copies the parts of a completed response that the promise needs. It runs in the completion callback, while the handle is still valid.
    fn read_response(
        response: &SteamHttpResponse,
        response_headers: &[String],
    ) -> Result<ResponseData, String> {
        if !response.request_successful() {
            return Err(if response.was_timed_out().unwrap_or(false) {
                "The HTTP request timed out before the server answered.".to_owned()
            } else {
                "The HTTP request failed: no response was received from the server.".to_owned()
            });
        }
        let mut headers = HashMap::new();
        for name in response_headers {
            if let Some(value) = response.response_header_value(name) {
                headers.insert(name.clone(), value);
            }
        }
        let body = response
            .response_body_data()
            .ok_or_else(|| "Steam could not return the response body.".to_owned())?;
        Ok(ResponseData {
            status: response.status_code(),
            headers,
            body,
            was_timed_out: false,
        })
    }
}
