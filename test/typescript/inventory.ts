import * as steamworks from "steamworks.js";
import type { inventory } from "steamworks.js";

// Reads the whole inventory and returns the instance ids of the items with one definition
export async function itemIdsOfDefinition(definition: number): Promise<bigint[]> {
	const client = steamworks.init(480);
	const result: inventory.InventoryResultData = await client.inventory.getAllItems(15000);
	return result.items.filter((item) => item.definition === definition).map((item) => item.itemId);
}

// Serializes the named items for another player; verifying them on the receiving side needs their Steam id
export async function serializeForPlayer(itemIds: bigint[]): Promise<Buffer> {
	const client = steamworks.init(480);
	return client.inventory.serializeItems(itemIds);
}

// Returns the verified items, or null when the buffer is invalid, out of date for Steam, or not owned by that player
export function verifyFromPlayer(data: Buffer, senderSteamId: bigint): inventory.InventoryResultData | null {
	const client = steamworks.init(480);
	return client.inventory.deserializeResult(data, senderSteamId);
}

// Consumes one unit of an item. This changes the user's real inventory, so ask the user first.
export async function consumeOne(itemId: bigint): Promise<boolean> {
	const client = steamworks.init(480);
	const result = await client.inventory.consumeItem(itemId, 1);
	return result.items.some((item) => (item.flags & 512) !== 0);
}

// Exchanges one owned item for a new one, following the recipe in Steamworks. Changes the real inventory.
export async function craft(ownedItemId: bigint, resultDefinition: number): Promise<inventory.InventoryResultData> {
	const client = steamworks.init(480);
	return client.inventory.exchangeItems(
		[{ definition: resultDefinition, quantity: 1 }],
		[{ itemId: ownedItemId, quantity: 1 }],
		30000,
	);
}

// Builds one property batch with two changes and submits it. Changes the real inventory.
export async function setItemLevel(itemId: bigint, level: number): Promise<void> {
	const client = steamworks.init(480);
	const update: inventory.InventoryPropertyUpdate | null = client.inventory.startUpdateProperties();
	if (update === null) {
		return;
	}
	update.setInt64(itemId, "level", BigInt(level));
	update.setString(itemId, "rank", "gold");
	await update.submit();
}

// Requests prices, then reads the price of one definition
export async function priceOf(definition: number): Promise<bigint | null> {
	const client = steamworks.init(480);
	const { currency } = await client.inventory.requestPrices();
	const price: inventory.ItemPrice | null = client.inventory.getItemPrice(definition);
	return currency.length > 0 && price !== null ? price.currentPrice : null;
}

// Starts a purchase and reads the order id; the user completes the purchase in the Steam overlay
export async function buy(definition: number): Promise<bigint> {
	const client = steamworks.init(480);
	const started: inventory.PurchaseStarted = await client.inventory.startPurchase([{ definition, quantity: 1 }]);
	return started.orderId;
}

// Lists every item definition with its properties; the list is null when Steam refuses it
export function definitionNames(): string[] {
	const client = steamworks.init(480);
	const definitions: inventory.ItemDefinition[] | null = client.inventory.getItemDefinitions();
	return (definitions ?? []).map((definition) => definition.properties["name"] ?? String(definition.id));
}
