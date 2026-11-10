import * as steamworks from "steamworks.js";
import type { workshop } from "steamworks.js";

export default function main() {
	const client = steamworks.init(480);
	console.log(client.localplayer.getName())
}

// Example of using workshop types
const item: workshop.WorkshopItem | null = null;

// Marks a child item as required by a parent, then removes it; both resolve with the Steam result code
export async function requireThenRemove(parentId: bigint, childId: bigint): Promise<number> {
	const client = steamworks.init(480);
	const added: number = await client.workshop.addDependency(parentId, childId);
	const removed: number = await client.workshop.removeDependency(parentId, childId);
	return added === 1 && removed === 1 ? 1 : 0;
}
