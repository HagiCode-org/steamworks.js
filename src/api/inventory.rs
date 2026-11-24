use napi_derive::napi;

/// Steam Inventory: the user's items, item definitions, promotions, prices and purchases.
///
/// Most functions start a query that Steam answers later. They return a promise that resolves once Steam's
/// `SteamInventoryResultReady_t` callback has arrived. Steam sends that callback while `runCallbacks()` runs, which
/// `init()` already does on a timer. Functions that grant, consume, create, trade, exchange or purchase items change
/// the user's real inventory, and their documentation says so.
#[napi]
pub mod inventory {
    use crate::client::get_client;
    use lazy_static::lazy_static;
    use napi::bindgen_prelude::{BigInt, Buffer, Error};
    use std::collections::HashMap;
    use std::sync::Mutex;
    use std::time::Duration;
    use steamworks::{
        InventoryEligiblePromoItemDefIds, InventoryRequestPricesResult, InventoryResult,
        InventoryResultReady, InventoryStartPurchaseResult, InventoryStatus, PropertyUpdate,
        SteamError, SteamId, ITEM_INSTANCE_ID_INVALID,
    };
    use tokio::sync::oneshot;

    /// How long a promise waits for Steam, in milliseconds, when `timeoutMs` is left out.
    const DEFAULT_TIMEOUT_MS: u32 = 30_000;

    /// One item instance of an inventory result.
    #[napi(object)]
    pub struct ItemDetails {
        /// The globally unique id of this item instance. It is a `bigint` because it can exceed 2^53, and it is never reused for another item.
        pub item_id: BigInt,
        /// The item definition id, a number between 1 and 999999999.
        pub definition: i32,
        /// The stack size of the item.
        pub quantity: u32,
        /// Status and action flags: `1` cannot be traded, `256` was removed (destroyed, traded away or expired), `512` was consumed by one `consumeItem` call.
        pub flags: u32,
    }

    impl From<steamworks::ItemDetails> for ItemDetails {
        fn from(item: steamworks::ItemDetails) -> Self {
            Self {
                item_id: BigInt::from(item.item_id),
                definition: item.definition,
                quantity: u32::from(item.quantity),
                flags: u32::from(item.flags),
            }
        }
    }

    /// The items of a finished inventory result.
    #[napi(object)]
    pub struct InventoryResultData {
        /// The item instances in the result. Empty when the result holds no items.
        pub items: Vec<ItemDetails>,
        /// The server time at which Steam generated the result, in Unix seconds (unverified against a live Steam client).
        pub timestamp: u32,
        /// `true` when Steam marked the result as possibly out of date (for example after an item was traded or consumed). The items are still valid to read.
        pub expired: bool,
    }

    /// A definition quantity pair, used to grant, generate or exchange items.
    #[napi(object)]
    pub struct ItemQuantity {
        /// The item definition id, a number between 1 and 999999999.
        pub definition: i32,
        /// How many items of that definition to use or create.
        pub quantity: u32,
    }

    /// An item instance quantity pair, used to consume, exchange or trade items the user already has.
    #[napi(object)]
    pub struct ItemInstanceQuantity {
        /// The instance id of the item, as in `ItemDetails.itemId`.
        pub item_id: BigInt,
        /// How many of that item to use.
        pub quantity: u32,
    }

    /// An item definition with all of its string properties.
    #[napi(object)]
    pub struct ItemDefinition {
        /// The item definition id.
        pub id: i32,
        /// Every property the definition has, by name. Some values (such as `name`) are localized for the current Steam language. A property whose value cannot be read is left out.
        pub properties: HashMap<String, String>,
    }

    /// The price of one item definition, in the currency that `requestPrices()` reported.
    #[napi(object)]
    pub struct ItemPrice {
        /// The item definition id.
        pub definition: i32,
        /// The current price, after any sale, in the currency's smallest unit (unverified against a live Steam client). A `bigint` because it can exceed 2^53.
        pub current_price: BigInt,
        /// The base price, without any sale, in the same unit as `currentPrice`.
        pub base_price: BigInt,
    }

    /// The answer to `requestPrices()`.
    #[napi(object)]
    pub struct PricesReceived {
        /// The currency code the prices are in, for example `USD`, as Steam reports it.
        pub currency: String,
    }

    /// The answer to `requestEligiblePromoItems()`.
    #[napi(object)]
    pub struct EligiblePromoItems {
        /// The item definition ids the user can be granted manually with `addPromoItem()`.
        pub item_definitions: Vec<i32>,
        /// `true` when Steam answered from its cache instead of the server.
        pub cached: bool,
    }

    /// The answer to `startPurchase()`. The purchase itself is completed by the user in the Steam overlay.
    #[napi(object)]
    pub struct PurchaseStarted {
        /// The order id Steam assigned to the purchase, as a `bigint`.
        pub order_id: BigInt,
        /// The transaction id Steam assigned to the purchase, as a `bigint`.
        pub transaction_id: BigInt,
    }

    /// A batch of item property changes. Create it with `startUpdateProperties()`, add changes with the set and
    /// remove methods, then send it with `submit()`. Nothing changes until `submit()` resolves.
    #[napi]
    pub struct InventoryPropertyUpdate {
        update: Mutex<Option<PropertyUpdate>>,
    }

    /// Where the `InventoryResultReady` callback goes. Every waiting promise has one slot, keyed by the raw handle.
    enum Slot {
        /// A promise is waiting for this handle. It receives Steam's error, or `None` when the result is ready.
        Waiting(oneshot::Sender<Option<SteamError>>),
        /// The promise gave up after its timeout. The result is kept here, so that its handle is destroyed when Steam reports it.
        Abandoned(InventoryResult),
    }

    lazy_static! {
        static ref SLOTS: Mutex<HashMap<i32, Slot>> = Mutex::new(HashMap::new());
        static ref DISPATCHER: Mutex<Option<steamworks::CallbackHandle>> = Mutex::new(None);
    }

    fn u64_arg(value: BigInt, name: &str) -> Result<u64, Error> {
        let (negative, number, lossless) = value.get_u64();
        if negative || !lossless {
            return Err(Error::from_reason(format!(
                "{name} must be a non-negative integer below 2^64"
            )));
        }
        Ok(number)
    }

    fn timeout_of(timeout_ms: Option<u32>) -> Duration {
        Duration::from_millis(u64::from(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS)))
    }

    fn unknown_outcome(operation: &str) -> Error {
        Error::from_reason(format!(
            "The completion of {operation} was not received; the outcome is unknown. Check the inventory before retrying."
        ))
    }

    fn timed_out(operation: &str, timeout: Duration) -> Error {
        Error::from_reason(format!(
            "No answer from Steam for {operation} within {} ms. The outcome is unknown: Steam may still have applied it. Check the inventory before retrying.",
            timeout.as_millis()
        ))
    }

    /// Registers the callback handler, replacing any earlier registration of the same callback id.
    ///
    /// The new handler is registered before the old handle is set aside, with no gap in which a ready callback could be
    /// lost. The old handle is forgotten rather than dropped: dropping a handle removes the callback registered under its
    /// id, which is now the new one. Forgetting it only leaves one weak reference to the old client state.
    fn ensure_dispatcher() {
        let client = get_client();
        let handle = client.register_callback(|ready: InventoryResultReady| dispatch_ready(ready));
        let previous = DISPATCHER.lock().unwrap().replace(handle);
        std::mem::forget(previous);
    }

    /// Routes one `InventoryResultReady` to the promise that waits for its handle. A handle nobody waits for is left alone.
    fn dispatch_ready(ready: InventoryResultReady) {
        let mut slots = SLOTS.lock().unwrap();
        let finished = slots.remove(&ready.handle);
        drop(slots);
        match finished {
            Some(Slot::Waiting(tx)) => {
                let _ = tx.send(ready.error);
            }
            Some(Slot::Abandoned(result)) => drop(result),
            None => {}
        }
    }

    /// Starts one inventory query and registers its waiter. Both happen under the slot lock, so the ready callback
    /// cannot run between the Steam call and the registration. Nothing is held across an `await`.
    fn start_query(
        start: impl FnOnce() -> Option<InventoryResult>,
        operation: &str,
    ) -> Result<(InventoryResult, oneshot::Receiver<Option<SteamError>>), Error> {
        ensure_dispatcher();
        let mut slots = SLOTS.lock().unwrap();
        let result = start()
            .ok_or_else(|| Error::from_reason(format!("Steam did not start {operation}.")))?;
        let (tx, rx) = oneshot::channel();
        slots.insert(result.raw(), Slot::Waiting(tx));
        Ok((result, rx))
    }

    /// Waits for the ready callback of one result, up to `timeout`. Resolves with the result when it is usable
    /// (status `Ok` or `Expired`), and rejects otherwise. On timeout the result is parked, and its handle is destroyed
    /// when the callback finally arrives.
    async fn wait_ready(
        result: InventoryResult,
        rx: oneshot::Receiver<Option<SteamError>>,
        timeout: Duration,
        operation: &str,
    ) -> Result<InventoryResult, Error> {
        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(None)) => match result.status() {
                InventoryStatus::Ok | InventoryStatus::Expired => Ok(result),
                InventoryStatus::Pending => Err(unknown_outcome(operation)),
                InventoryStatus::Failed(error) => {
                    Err(Error::from_reason(format!("{operation} failed: {error}")))
                }
            },
            Ok(Ok(Some(error))) => Err(Error::from_reason(format!("{operation} failed: {error}"))),
            Ok(Err(_)) => Err(unknown_outcome(operation)),
            Err(_) => {
                park(result);
                Err(timed_out(operation, timeout))
            }
        }
    }

    /// Keeps a timed-out result until its ready callback arrives, then destroys it. If the callback already ran,
    /// the result is destroyed here.
    fn park(result: InventoryResult) {
        let raw = result.raw();
        let mut slots = SLOTS.lock().unwrap();
        match slots.remove(&raw) {
            Some(Slot::Waiting(_)) => {
                let _ = slots.insert(raw, Slot::Abandoned(result));
            }
            _ => drop(result),
        }
    }

    /// Reads the items and timestamp of a ready result.
    fn read_data(result: &InventoryResult) -> Result<InventoryResultData, Error> {
        let expired = matches!(result.status(), InventoryStatus::Expired);
        let items = result
            .items()
            .ok_or_else(|| Error::from_reason("Steam did not return the items of the result."))?;
        Ok(InventoryResultData {
            items: items.into_iter().map(ItemDetails::from).collect(),
            timestamp: result.timestamp(),
            expired,
        })
    }

    /// Waits for a call result (a request that carries no handle), up to `timeout`.
    async fn await_call<T>(
        rx: oneshot::Receiver<Result<T, SteamError>>,
        timeout: Duration,
        operation: &str,
    ) -> Result<T, Error> {
        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(error))) => Err(Error::from_reason(format!("{operation} failed: {error}"))),
            Ok(Err(_)) => Err(unknown_outcome(operation)),
            Err(_) => Err(timed_out(operation, timeout)),
        }
    }

    /// Runs one inventory query that resolves with the items it returns.
    async fn run_items_query(
        start: impl FnOnce() -> Option<InventoryResult>,
        timeout_ms: Option<u32>,
        operation: &str,
    ) -> Result<InventoryResultData, Error> {
        let timeout = timeout_of(timeout_ms);
        let (result, rx) = start_query(start, operation)?;
        let result = wait_ready(result, rx, timeout, operation).await?;
        read_data(&result)
    }

    /// Captures the whole inventory of the current user. Resolves with its items.
    ///
    /// Steam may rate-limit this and return a cached copy, so call it when the inventory is about to be shown, not on every frame. Read-only: it changes nothing.
    /// Rejects when Steam cannot start the query, when it reports an error, or when no answer arrives in time.
    ///
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the items of the inventory and the time Steam generated them.
    #[napi]
    pub async fn get_all_items(timeout_ms: Option<u32>) -> Result<InventoryResultData, Error> {
        run_items_query(
            || get_client().inventory().get_all_items(),
            timeout_ms,
            "getting the inventory",
        )
        .await
    }

    /// Captures the state of some items of the current user, by instance id. Resolves with those items only.
    ///
    /// Read-only. The result can be serialized with `serializeItems()` and checked by another player.
    /// Rejects when an id is negative or too large, when Steam reports an error, or when no answer arrives in time.
    ///
    /// @param itemIds - The instance ids of the items to read, as `bigint` values.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the requested items that the user owns.
    #[napi]
    pub async fn get_items_by_id(
        item_ids: Vec<BigInt>,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        let ids = item_ids
            .into_iter()
            .map(|id| u64_arg(id, "itemIds"))
            .collect::<Result<Vec<u64>, Error>>()?;
        run_items_query(
            || get_client().inventory().get_items_by_id(&ids),
            timeout_ms,
            "reading the items by id",
        )
        .await
    }

    /// Serializes the named items into a signed buffer, so that another player can verify ownership with `deserializeResult()`.
    ///
    /// Read-only. It builds a small result with `getItemsByID`, as the SDK recommends, and then serializes it. Steam marks the buffer `expired` after one hour; the check in `deserializeResult()` then still returns the items, with `expired` set.
    /// Rejects when an id is invalid, when Steam reports an error, or when no answer arrives in time.
    ///
    /// @param itemIds - The instance ids of the items to prove, as `bigint` values.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the serialized, signed result.
    #[napi]
    pub async fn serialize_items(
        item_ids: Vec<BigInt>,
        timeout_ms: Option<u32>,
    ) -> Result<Buffer, Error> {
        let ids = item_ids
            .into_iter()
            .map(|id| u64_arg(id, "itemIds"))
            .collect::<Result<Vec<u64>, Error>>()?;
        let timeout = timeout_of(timeout_ms);
        let (result, rx) = start_query(
            || get_client().inventory().get_items_by_id(&ids),
            "reading the items by id",
        )?;
        let result = wait_ready(result, rx, timeout, "reading the items to serialize").await?;
        result
            .serialize()
            .map(Buffer::from)
            .ok_or_else(|| Error::from_reason("Steam refused to serialize the items."))
    }

    /// Checks a buffer made by `serializeItems()` and reads the items in it. This runs synchronously and does not wait for Steam.
    ///
    /// Read-only. Returns `null` when Steam rejects the buffer (for example because it was altered), when Steam is offline and needs a full online check, or when the items belong to a different user than `expectedSteamId`. Always pass the id of the player who sent the buffer, so that nobody can pass off another player's items.
    ///
    /// @param data - The buffer received from another player.
    /// @param expectedSteamId - The 64-bit Steam id of the player who should own the items, as a `bigint`.
    /// @returns the verified items with `expired` set when the buffer is out of date, or `null` when verification fails.
    #[napi]
    pub fn deserialize_result(
        data: Buffer,
        expected_steam_id: BigInt,
    ) -> Result<Option<InventoryResultData>, Error> {
        let expected = SteamId::from_raw(u64_arg(expected_steam_id, "expectedSteamId")?);
        let result = match get_client().inventory().deserialize_result(data.as_ref()) {
            Some(result) => result,
            None => return Ok(None),
        };
        if !result.check_steam_id(expected) {
            return Ok(None);
        }
        match result.status() {
            InventoryStatus::Ok | InventoryStatus::Expired => Ok(read_data(&result).ok()),
            _ => Ok(None),
        }
    }

    /// Creates new items in the user's inventory. Resolves with the created items.
    ///
    /// This changes the user's real inventory. Steam accepts it only from accounts in the game's publisher group, and only for prototyping.
    /// Rejects when Steam refuses the request, reports an error, or sends no answer in time.
    ///
    /// @param items - The item definitions to create, with their quantities.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the items that Steam created.
    #[napi]
    pub async fn generate_items(
        items: Vec<ItemQuantity>,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        let pairs: Vec<(i32, u32)> = items
            .into_iter()
            .map(|i| (i.definition, i.quantity))
            .collect();
        run_items_query(
            || get_client().inventory().generate_items(&pairs),
            timeout_ms,
            "generating the items",
        )
        .await
    }

    /// Grants the promotional items the user is eligible for, once only. Resolves with the granted items.
    ///
    /// This changes the user's real inventory. Being eligible for no promotion still resolves, with an empty list.
    /// Rejects when Steam reports an error or sends no answer in time.
    ///
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the promotional items that were granted.
    #[napi]
    pub async fn grant_promo_items(timeout_ms: Option<u32>) -> Result<InventoryResultData, Error> {
        run_items_query(
            || get_client().inventory().grant_promo_items(),
            timeout_ms,
            "granting the promotional items",
        )
        .await
    }

    /// Grants one promotional item definition, if the user is eligible for it. Resolves with the granted items.
    ///
    /// This changes the user's real inventory. Use `requestEligiblePromoItems()` to see which definitions can be granted.
    /// Rejects when Steam refuses the grant, reports an error or sends no answer in time.
    ///
    /// @param definition - The promotional item definition id.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the items that were granted.
    #[napi]
    pub async fn add_promo_item(
        definition: i32,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        run_items_query(
            || get_client().inventory().add_promo_item(definition),
            timeout_ms,
            "adding the promotional item",
        )
        .await
    }

    /// Grants several promotional item definitions, if the user is eligible for them. Only the listed definitions are checked.
    ///
    /// This changes the user's real inventory. Rejects when Steam refuses the grant, reports an error or sends no answer in time.
    ///
    /// @param definitions - The promotional item definition ids.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the items that were granted.
    #[napi]
    pub async fn add_promo_items(
        definitions: Vec<i32>,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        run_items_query(
            || get_client().inventory().add_promo_items(&definitions),
            timeout_ms,
            "adding the promotional items",
        )
        .await
    }

    /// Permanently removes items from the user's inventory. The items cannot be recovered. Resolves with the inventory after the change.
    ///
    /// This changes the user's real inventory and cannot be undone. Ask the user to confirm before calling it. Rejects when the id is invalid, Steam reports an error, or no answer arrives in time.
    ///
    /// @param itemId - The instance id of the item, as a `bigint`.
    /// @param quantity - How many of the item to remove.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the result, which holds the consumed item with its `ITEM_FLAG_CONSUMED` flag set.
    #[napi]
    pub async fn consume_item(
        item_id: BigInt,
        quantity: u32,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        let item_id = u64_arg(item_id, "itemId")?;
        run_items_query(
            || get_client().inventory().consume_item(item_id, quantity),
            timeout_ms,
            "consuming the item",
        )
        .await
    }

    /// Atomically destroys some items and creates others, following the exchange recipe set in Steamworks (for example crafting or opening a chest). Resolves with the result.
    ///
    /// This changes the user's real inventory and cannot be undone. Steam fails the whole exchange when the items do not match a recipe. Ask the user to confirm before calling it.
    /// Rejects when Steam refuses the exchange, reports an error or sends no answer in time.
    ///
    /// @param generate - The item definitions to create, with their quantities.
    /// @param destroy - The owned items to use up, with their quantities.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the result of the exchange, which holds the created items.
    #[napi]
    pub async fn exchange_items(
        generate: Vec<ItemQuantity>,
        destroy: Vec<ItemInstanceQuantity>,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        let generate: Vec<(i32, u32)> = generate
            .into_iter()
            .map(|i| (i.definition, i.quantity))
            .collect();
        let destroy = destroy
            .into_iter()
            .map(|i| Ok((u64_arg(i.item_id, "destroy.itemId")?, i.quantity)))
            .collect::<Result<Vec<(u64, u32)>, Error>>()?;
        run_items_query(
            || get_client().inventory().exchange_items(&generate, &destroy),
            timeout_ms,
            "exchanging the items",
        )
        .await
    }

    /// Moves quantity between two stacks of the same item, or splits a stack into a new item when `destination` is `null`. Resolves with the result.
    ///
    /// This changes the user's real inventory. Only stackable items can be split or merged.
    /// Rejects when Steam refuses the transfer, reports an error or sends no answer in time.
    ///
    /// @param source - The instance id of the stack to take quantity from, as a `bigint`.
    /// @param quantity - How much to move.
    /// @param destination - The instance id of the stack to add to, as a `bigint`, or `null` to split off a new item.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the result of the transfer.
    #[napi]
    pub async fn transfer_item_quantity(
        source: BigInt,
        quantity: u32,
        destination: Option<BigInt>,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        let source = u64_arg(source, "source")?;
        let destination = match destination {
            Some(id) => u64_arg(id, "destination")?,
            None => ITEM_INSTANCE_ID_INVALID,
        };
        run_items_query(
            || {
                get_client()
                    .inventory()
                    .transfer_item_quantity(source, quantity, destination)
            },
            timeout_ms,
            "transferring the item quantity",
        )
        .await
    }

    /// Deprecated by Steam: sending a drop heartbeat is no longer required for playtime accounting. This does nothing that Steam still uses.
    #[napi]
    pub fn send_item_drop_heartbeat() {
        get_client().inventory().send_item_drop_heartbeat();
    }

    /// Turns playtime credit into an item drop from a drop list definition. Resolves with the result, which is empty when there is not enough playtime credit.
    ///
    /// This changes the user's real inventory. Only definitions marked as playtime item generators in Steamworks can drop. Players can modify their client, so do not use the definition to control rarity.
    /// Rejects when Steam reports an error or sends no answer in time.
    ///
    /// @param dropListDefinition - The drop list definition id.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the items that dropped, which may be none.
    #[napi]
    pub async fn trigger_item_drop(
        drop_list_definition: i32,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        run_items_query(
            || {
                get_client()
                    .inventory()
                    .trigger_item_drop(drop_list_definition)
            },
            timeout_ms,
            "triggering the item drop",
        )
        .await
    }

    /// Deprecated by Steam: the SDK documents trading through the inventory as not supported. The call is wrapped for completeness and is expected to reject. Unverified against a live Steam client.
    ///
    /// If Steam does accept it, this changes the user's real inventory by trading items with `partner`.
    ///
    /// @param partner - The Steam id of the trade partner, as a `bigint`.
    /// @param give - The items the user gives, with their quantities.
    /// @param get - The items the user receives, with their quantities.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the result of the trade.
    #[napi]
    pub async fn trade_items(
        partner: BigInt,
        give: Vec<ItemInstanceQuantity>,
        get: Vec<ItemInstanceQuantity>,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        let partner = SteamId::from_raw(u64_arg(partner, "partner")?);
        let give = give
            .into_iter()
            .map(|i| Ok((u64_arg(i.item_id, "give.itemId")?, i.quantity)))
            .collect::<Result<Vec<(u64, u32)>, Error>>()?;
        let get = get
            .into_iter()
            .map(|i| Ok((u64_arg(i.item_id, "get.itemId")?, i.quantity)))
            .collect::<Result<Vec<(u64, u32)>, Error>>()?;
        run_items_query(
            || get_client().inventory().trade_items(partner, &give, &get),
            timeout_ms,
            "trading the items",
        )
        .await
    }

    /// Starts loading and refreshing the item definitions. Returns `false` when the load cannot start.
    ///
    /// The definitions are complete only after Steam's definition update callback, so read `getItemDefinitions()` after that, not right after this call. Read-only.
    ///
    /// @returns `true` when the load started, otherwise `false`.
    #[napi]
    pub fn load_item_definitions() -> bool {
        get_client().inventory().load_item_definitions()
    }

    /// Returns the ids of all item definitions set up in Steamworks. Returns `null` when Steam refuses the call, for example before the definitions are loaded.
    ///
    /// Read-only. The ids are not necessarily contiguous.
    ///
    /// @returns the item definition ids.
    #[napi]
    pub fn get_item_definition_ids() -> Option<Vec<i32>> {
        get_client().inventory().item_definition_ids()
    }

    /// Returns every item definition with all of its properties. Returns `null` when Steam refuses to list the ids.
    ///
    /// Read-only. It reads each definition's properties one by one, so call it once and keep the result. Run it after the definitions are loaded.
    ///
    /// @returns each definition id with a record of its properties.
    #[napi]
    pub fn get_item_definitions() -> Option<Vec<ItemDefinition>> {
        let client = get_client();
        let inventory = client.inventory();
        let ids = inventory.item_definition_ids()?;
        Some(
            ids.into_iter()
                .map(|id| {
                    let names = inventory
                        .item_definition_property_names(id)
                        .unwrap_or_default();
                    let properties = names
                        .into_iter()
                        .filter_map(|name| {
                            inventory
                                .item_definition_property(id, &name)
                                .map(|value| (name, value))
                        })
                        .collect();
                    ItemDefinition { id, properties }
                })
                .collect(),
        )
    }

    /// Returns one string property of an item definition, or `null` when it is unknown or cannot be read.
    ///
    /// Read-only. Some properties, such as `name`, are localized for the current Steam language.
    ///
    /// @param definition - The item definition id.
    /// @param name - The property name, made of ASCII letters, digits and underscores.
    /// @returns the property value, or `null`.
    #[napi]
    pub fn get_item_definition_property(definition: i32, name: String) -> Option<String> {
        get_client()
            .inventory()
            .item_definition_property(definition, &name)
    }

    /// Asks Steam which promotional item definitions the user can be granted manually. Resolves with their ids.
    ///
    /// Read-only: this does not change the inventory. Grant one of them with `addPromoItem()`.
    /// Rejects when Steam reports an error or sends no answer in time.
    ///
    /// @param steamId - The 64-bit Steam id of the user, as a `bigint`.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the eligible item definition ids and whether they came from the cache.
    #[napi]
    pub async fn request_eligible_promo_items(
        steam_id: BigInt,
        timeout_ms: Option<u32>,
    ) -> Result<EligiblePromoItems, Error> {
        let timeout = timeout_of(timeout_ms);
        let steam_id = SteamId::from_raw(u64_arg(steam_id, "steamId")?);
        let (tx, rx) = oneshot::channel::<Result<InventoryEligiblePromoItemDefIds, SteamError>>();
        get_client()
            .inventory()
            .request_eligible_promo_item_definitions(steam_id, move |result| {
                let _ = tx.send(result);
            });
        let answer = await_call(rx, timeout, "requesting the eligible promo items").await?;
        let count = u32::try_from(answer.count).unwrap_or(0);
        let item_definitions = get_client()
            .inventory()
            .eligible_promo_item_definition_ids(steam_id, count)
            .ok_or_else(|| {
                Error::from_reason("Steam did not return the eligible promo item ids.")
            })?;
        Ok(EligiblePromoItems {
            item_definitions,
            cached: answer.cached,
        })
    }

    /// Starts buying item definitions. Resolves with the order and transaction ids once Steam has opened the purchase.
    ///
    /// This is a real purchase that charges the user. The user confirms it in the Steam overlay; the final purchase result arrives later as Steam's result-ready callback, not through this promise.
    /// Rejects when Steam cannot start the transaction, reports an error or sends no answer in time.
    ///
    /// @param items - The item definitions to buy, with their quantities.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the order id and transaction id Steam assigned.
    #[napi]
    pub async fn start_purchase(
        items: Vec<ItemQuantity>,
        timeout_ms: Option<u32>,
    ) -> Result<PurchaseStarted, Error> {
        let timeout = timeout_of(timeout_ms);
        let pairs: Vec<(i32, u32)> = items
            .into_iter()
            .map(|i| (i.definition, i.quantity))
            .collect();
        let (tx, rx) = oneshot::channel::<Result<InventoryStartPurchaseResult, SteamError>>();
        get_client()
            .inventory()
            .start_purchase(&pairs, move |result| {
                let _ = tx.send(result);
            });
        let started = await_call(rx, timeout, "starting the purchase").await?;
        Ok(PurchaseStarted {
            order_id: BigInt::from(started.order_id),
            transaction_id: BigInt::from(started.transaction_id),
        })
    }

    /// Asks Steam for the current prices of the item definitions. Resolves with the currency of the prices.
    ///
    /// Read-only. Call it before `getItemsWithPrices()` or `getItemPrice()`.
    /// Rejects when Steam reports an error or sends no answer in time.
    ///
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the currency code of the prices.
    #[napi]
    pub async fn request_prices(timeout_ms: Option<u32>) -> Result<PricesReceived, Error> {
        let timeout = timeout_of(timeout_ms);
        let (tx, rx) = oneshot::channel::<Result<InventoryRequestPricesResult, SteamError>>();
        get_client().inventory().request_prices(move |result| {
            let _ = tx.send(result);
        });
        let received = await_call(rx, timeout, "requesting the prices").await?;
        Ok(PricesReceived {
            currency: received.currency,
        })
    }

    /// Returns how many item definitions have a price. Call `requestPrices()` first.
    ///
    /// Read-only. Returns `0` before the prices are requested.
    ///
    /// @returns the number of item definitions with a price.
    #[napi]
    pub fn get_num_items_with_prices() -> u32 {
        get_client().inventory().num_items_with_prices()
    }

    /// Returns the prices of all item definitions that have one. Returns `null` when Steam refuses to list them, for example before `requestPrices()` completes.
    ///
    /// Read-only. Prices are in the smallest unit of the currency from `requestPrices()`.
    ///
    /// @returns the price of each item definition that has one.
    #[napi]
    pub fn get_items_with_prices() -> Option<Vec<ItemPrice>> {
        get_client().inventory().items_with_prices().map(|prices| {
            prices
                .into_iter()
                .map(|price| ItemPrice {
                    definition: price.definition,
                    current_price: BigInt::from(price.current),
                    base_price: BigInt::from(price.base),
                })
                .collect()
        })
    }

    /// Returns the price of one item definition. Returns `null` when Steam stores no price for it.
    ///
    /// Read-only. Call `requestPrices()` first.
    ///
    /// @param definition - The item definition id.
    /// @returns the current and base price, or `null`.
    #[napi]
    pub fn get_item_price(definition: i32) -> Option<ItemPrice> {
        get_client()
            .inventory()
            .item_price(definition)
            .map(|price| ItemPrice {
                definition: price.definition,
                current_price: BigInt::from(price.current),
                base_price: BigInt::from(price.base),
            })
    }

    /// Starts a batch of item property changes. Returns `null` when Steam refuses to start one.
    ///
    /// Add changes with the set and remove methods, then send the batch with `submit()`. Nothing changes until `submit()` resolves.
    ///
    /// @returns a new property update batch, or `null`.
    #[napi]
    pub fn start_update_properties() -> Option<InventoryPropertyUpdate> {
        get_client()
            .inventory()
            .start_update_properties()
            .map(|update| InventoryPropertyUpdate {
                update: Mutex::new(Some(update)),
            })
    }

    /// Asks Steam to fetch the item described by an inspection token, such as one from an item link. Resolves with the item.
    ///
    /// Read-only. Rejects when the token is invalid, Steam reports an error or sends no answer in time.
    ///
    /// @param token - The inspection token, as text.
    /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
    /// @returns the inspected item.
    #[napi]
    pub async fn inspect_item(
        token: String,
        timeout_ms: Option<u32>,
    ) -> Result<InventoryResultData, Error> {
        run_items_query(
            || get_client().inventory().inspect_item(&token),
            timeout_ms,
            "inspecting the item",
        )
        .await
    }

    impl InventoryPropertyUpdate {
        /// Applies a change to this batch, or throws with the reason.
        fn change(
            &self,
            action: &str,
            apply: impl FnOnce(&PropertyUpdate) -> Result<(), ()>,
        ) -> Result<(), Error> {
            let guard = self.update.lock().unwrap();
            let update = guard
                .as_ref()
                .ok_or_else(|| Error::from_reason("This property update was already submitted."))?;
            apply(update).map_err(|_| {
                Error::from_reason(format!(
                    "Steam refused to {action}. Check the item id; names and values must not contain NUL characters."
                ))
            })
        }
    }

    #[napi]
    impl InventoryPropertyUpdate {
        /// Sets a string property on an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name or value contains a NUL character.
        ///
        /// Nothing changes until `submit()` resolves.
        ///
        /// @param itemId - The instance id of the item, as a `bigint`.
        /// @param name - The property name, made of ASCII letters, digits and underscores.
        /// @param value - The new string value.
        #[napi]
        pub fn set_string(
            &self,
            item_id: BigInt,
            name: String,
            value: String,
        ) -> Result<(), Error> {
            let item_id = u64_arg(item_id, "itemId")?;
            self.change("set the string property", |update| {
                update.set_string(item_id, &name, &value)
            })
        }

        /// Sets a boolean property on an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name contains a NUL character.
        ///
        /// @param itemId - The instance id of the item, as a `bigint`.
        /// @param name - The property name, made of ASCII letters, digits and underscores.
        /// @param value - The new boolean value.
        #[napi]
        pub fn set_bool(&self, item_id: BigInt, name: String, value: bool) -> Result<(), Error> {
            let item_id = u64_arg(item_id, "itemId")?;
            self.change("set the boolean property", |update| {
                update.set_bool(item_id, &name, value)
            })
        }

        /// Sets a 64-bit integer property on an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name contains a NUL character.
        ///
        /// @param itemId - The instance id of the item, as a `bigint`.
        /// @param name - The property name, made of ASCII letters, digits and underscores.
        /// @param value - The new value, as a `bigint` between -2^63 and 2^63 - 1.
        #[napi]
        pub fn set_int64(&self, item_id: BigInt, name: String, value: BigInt) -> Result<(), Error> {
            let item_id = u64_arg(item_id, "itemId")?;
            let (negative, magnitude, lossless) = value.get_u64();
            let value = if !lossless {
                return Err(Error::from_reason("value must fit in 64 bits"));
            } else if negative {
                if magnitude > (i64::MAX as u64) + 1 {
                    return Err(Error::from_reason("value must be at least -2^63"));
                }
                (magnitude as i64).wrapping_neg()
            } else {
                if magnitude > i64::MAX as u64 {
                    return Err(Error::from_reason("value must be at most 2^63 - 1"));
                }
                magnitude as i64
            };
            self.change("set the integer property", |update| {
                update.set_i64(item_id, &name, value)
            })
        }

        /// Sets a float property on an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name contains a NUL character.
        ///
        /// The value is stored as a 32-bit float, so precision beyond about seven digits is lost.
        ///
        /// @param itemId - The instance id of the item, as a `bigint`.
        /// @param name - The property name, made of ASCII letters, digits and underscores.
        /// @param value - The new value.
        #[napi]
        pub fn set_float(&self, item_id: BigInt, name: String, value: f64) -> Result<(), Error> {
            let item_id = u64_arg(item_id, "itemId")?;
            self.change("set the float property", |update| {
                update.set_f32(item_id, &name, value as f32)
            })
        }

        /// Removes a property from an item in this batch. Throws when Steam refuses it, when the batch was already submitted, or when the name contains a NUL character.
        ///
        /// @param itemId - The instance id of the item, as a `bigint`.
        /// @param name - The property name to remove.
        #[napi]
        pub fn remove(&self, item_id: BigInt, name: String) -> Result<(), Error> {
            let item_id = u64_arg(item_id, "itemId")?;
            self.change("remove the property", |update| {
                update.remove_property(item_id, &name)
            })
        }

        /// Sends the batch to Steam and changes the item properties of the user's real inventory. This cannot be undone. Resolves with the updated items.
        ///
        /// The batch can be submitted only once. Rejects when the batch was already submitted, when Steam refuses it, reports an error, or sends no answer in time. After a timeout the outcome is unknown, so check the inventory before retrying.
        ///
        /// @param timeoutMs - How long to wait for Steam, in milliseconds. Defaults to 30000.
        /// @returns the items after the change, as Steam returns them.
        #[napi]
        pub async fn submit(&self, timeout_ms: Option<u32>) -> Result<InventoryResultData, Error> {
            let update =
                self.update.lock().unwrap().take().ok_or_else(|| {
                    Error::from_reason("This property update was already submitted.")
                })?;
            run_items_query(
                move || update.submit(),
                timeout_ms,
                "submitting the property update",
            )
            .await
        }
    }
}
