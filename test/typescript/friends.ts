import * as steamworks from "steamworks.js";
import type { friends } from "steamworks.js";

// Type-only examples of the ISteamFriends additions. They are checked by `tsc --noEmit --strict friends.ts`, not run.
// The package exports the `friends` namespace as types only, so enum members are written as their numeric values, typed with the enum type.

// Lists the local user's friends groups with each group's members (SteamID64s as bigint)
export function listFriendGroups(): friends.FriendGroup[] {
	const client = steamworks.init(480);
	return client.friends.getFriendGroups();
}

// Reads every clan without a Steam request, then asks for the owner and officers of the first one
export async function readClans(): Promise<friends.ClanInfo | null> {
	const client = steamworks.init(480);
	const clans: friends.ClanSummary[] = client.friends.getClans();
	if (clans.length === 0) {
		return null;
	}
	return client.friends.getClanInfo(clans[0].steamId64);
}

// Joins a clan chat room, and reads the newest message only when the join succeeded
export async function joinAndReadFirstMessage(clanChatId: bigint): Promise<friends.ChatMessage | null> {
	const client = steamworks.init(480);
	const response: friends.ChatRoomEnterResponse = await client.friends.joinClanChatRoom(clanChatId);
	const success: friends.ChatRoomEnterResponse = 1; // ChatRoomEnterResponse.Success
	if (response !== success) {
		return null;
	}
	return client.friends.getClanChatMessage(clanChatId, 0);
}

// Sends a clan chat message and a reply to a friend; both return whether Steam accepted the message
export function sendMessages(clanChatId: bigint, friendId: bigint): boolean {
	const client = steamworks.init(480);
	const toClan: boolean = client.friends.sendClanChatMessage(clanChatId, "hello");
	const toFriend: boolean = client.friends.replyToFriendMessage(friendId, "hello");
	return toClan && toFriend;
}

// Reads a follower count and one page of the following list, both as promises that resolve after runCallbacks
export async function followersAndFollowing(userId: bigint): Promise<number> {
	const client = steamworks.init(480);
	const count: number = await client.friends.getFollowerCount(userId);
	const page: { steamIds: bigint[]; totalCount: number } = await client.friends.enumerateFollowingList(0);
	return count + page.totalCount;
}

// Checks the relationship and reads a profile item's title after the equipped items have been requested
export async function profileTitle(userId: bigint): Promise<string | null> {
	const client = steamworks.init(480);
	const friendRelationship: friends.FriendRelationship = 3; // FriendRelationship.Friend
	if (client.friends.getFriendRelationship(userId) !== friendRelationship) {
		return null;
	}
	const items = await client.friends.requestEquippedProfileItems(userId);
	if (!items.hasProfileBackground) {
		return null;
	}
	const background: friends.ProfileItemType = 3; // ProfileItemType.ProfileBackground
	const title: friends.ProfileItemProperty = 3; // ProfileItemProperty.Title
	return client.friends.getProfileItemPropertyString(userId, background, title);
}

// Requests a friend's rich presence and reads the "status" value once it has arrived
export function requestStatus(friendId: bigint): string | null {
	const client = steamworks.init(480);
	client.friends.requestFriendRichPresence(friendId);
	return client.friends.getFriendRichPresence(friendId, "status");
}
