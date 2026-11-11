import * as steamworks from "steamworks.js";
import type { cloud, friends, leaderboard, matchmakingServers, networkingMessages, networkingSockets, networkingUtils, remotePlay, timeline, workshop } from "steamworks.js";

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

// Example of using the friends namespace: lists friends who are online and not in a game
export async function listOnlineFriends(): Promise<string[]> {
	const client = steamworks.init(480);
	const names: string[] = [];
	for (const friend of client.friends.getFriends(0x4)) {
		const state: friends.FriendState = client.friends.getFriendState(friend.steamId64);
		const avatar: Buffer | null = client.friends.getMediumAvatar(friend.steamId64);
		const appId: number | null = client.friends.getFriendGamePlayed(friend.steamId64);
		if (avatar !== null && appId === null && state !== undefined) {
			names.push(friend.nickName ?? friend.name);
		}
	}
	client.friends.clearRichPresence();
	return names;
}

// Example of the stats and achievement additions: stores a float stat and reads global unlock percentages
export async function recordDistance(meters: number): Promise<number | null> {
	const client = steamworks.init(480);
	const stored: boolean = client.stats.setFloat("distance", meters);
	const count: number | null = client.stats.getNumAchievements();
	await client.achievement.requestGlobalPercentages();
	const percent: number | null = client.achievement.getAchievedPercent("FIRST_RUN");
	return stored && count !== null && percent !== null ? client.stats.getFloat("distance") : null;
}

// Example of the leaderboard namespace: finds or creates a board, uploads a score and reads the top ten
export async function submitScore(name: string, score: number): Promise<boolean> {
	const client = steamworks.init(480);
	const ascending: leaderboard.LeaderboardSortMethod = 0;
	const numeric: leaderboard.LeaderboardDisplayType = 0;
	const keepBest: leaderboard.UploadScoreMethod = 0;
	const global: leaderboard.LeaderboardDataRequest = 0;
	const board = await client.leaderboard.findOrCreate(name, ascending, numeric);
	if (board === null) {
		return false;
	}
	const uploaded = await board.uploadScore(keepBest, score, []);
	const top = await board.downloadEntries(global, 0, 10, 0);
	return uploaded !== null && top.length <= 10;
}

// Example of registering every callback added by the callback batch; each handler's payload type comes from CallbackReturns
export function listenToNewCallbacks(): void {
	const client = steamworks.init(480);
	client.callback.register(steamworks.SteamCallback.DownloadItemResult, (value) => console.log(value.published_file_id, value.error));
	client.callback.register(steamworks.SteamCallback.UserStatsReceived, (value) => console.log(value.steam_id, value.result));
	client.callback.register(steamworks.SteamCallback.UserStatsStored, (value) => console.log(value.game_id, value.result));
	client.callback.register(steamworks.SteamCallback.UserAchievementStored, (value) => console.log(value.achievement_name, value.current_progress, value.max_progress));
	client.callback.register(steamworks.SteamCallback.GameOverlayActivated, (value) => console.log(value.active));
	client.callback.register(steamworks.SteamCallback.GameRichPresenceJoinRequested, (value) => console.log(value.friend_steam_id, value.connect));
	client.callback.register(steamworks.SteamCallback.LobbyEnter, (value) => console.log(value.lobby, value.chat_room_enter_response));
	client.callback.register(steamworks.SteamCallback.LobbyChatMsg, (value) => console.log(value.user, value.chat_entry_type, value.chat_id));
	client.callback.register(steamworks.SteamCallback.ScreenshotRequested, (value) => console.log(value));
	client.callback.register(steamworks.SteamCallback.ScreenshotReady, (value) => console.log(value.local_handle));
	client.callback.register(steamworks.SteamCallback.NewUrlLaunchParameters, (value) => console.log(value));
	client.callback.register(steamworks.SteamCallback.AuthSessionTicketResponse, (value) => console.log(value.ticket, value.result));
	client.callback.register(steamworks.SteamCallback.ValidateAuthTicketResponse, (value) => console.log(value.steam_id, value.response, value.owner_steam_id));
}

// Example of the networking namespaces: relay status, session requests on messages, and a listen socket with a connection
export async function networkingExample(): Promise<number> {
	const client = steamworks.init(480);
	client.networkingUtils.initRelayNetworkAccess();
	const summary: networkingUtils.NetworkingAvailability = client.networkingUtils.getRelayNetworkStatus();
	const detail: networkingUtils.RelayNetworkStatus = client.networkingUtils.getDetailedRelayNetworkStatus();
	console.log(summary, detail.debuggingMessage);

	// Accept session requests from Steam users only, and send a message on channel 3
	client.networkingMessages.onSessionRequest((request) => {
		if (request.steamId64 !== null) {
			request.accept();
		} else {
			request.reject();
		}
	});
	client.networkingMessages.onSessionFailed((failure) => console.log(failure.steamId64, failure.endReason));
	client.networkingMessages.sendMessageToUser(client.localplayer.getSteamId().steamId64, 8, Buffer.from("hello"), 3);
	const received: networkingMessages.ReceivedMessage[] = client.networkingMessages.receiveMessagesOnChannel(3, 10);

	// Listen for IP connections, answer requests without waiting, and read the first connection
	const listen: networkingSockets.ListenSocket = client.networkingSockets.createListenSocketIp("0.0.0.0:27015");
	const event: networkingSockets.SocketEvent | null = listen.tryReceiveEvent();
	const connecting: networkingSockets.ListenSocketEventKind = 0;
	if (event !== null && event.kind === connecting) {
		event.accept();
	}

	const connection: networkingSockets.Connection = client.networkingSockets.connectByIpAddress("203.0.113.5:27015");
	connection.send(Buffer.from("ping"), 8);
	const replies: Buffer[] = connection.receive(16);
	const info: networkingSockets.ConnectionInfo = connection.getInfo();
	const status: networkingSockets.ConnectionRealtimeStatus = connection.getRealtimeStatus();
	connection.setUserData(info.userData);
	const pollGroup: networkingSockets.PollGroup = client.networkingSockets.createPollGroup();
	connection.setPollGroup(pollGroup);
	const batch: networkingSockets.PollGroupMessage[] = pollGroup.receiveMessages(32);
	const authentication: networkingUtils.NetworkingAvailability = client.networkingSockets.initAuthentication();
	connection.close(1000, "done", true);
	pollGroup.close();
	listen.close();
	return replies.length + batch.length + received.length + info.userData.toString().length + status.ping + (authentication === 0 ? 0 : 1);
}

// Example of matchmakingServers: pings the first LAN server, then releases the list
export async function pingFirstLanServer(appId: number): Promise<number | null> {
	const client = steamworks.init(appId);
	const list = client.matchmakingServers.lanServerList(appId);
	try {
		if (list.getServerCount() === 0) {
			return null;
		}
		const server = list.getServerDetails(0);
		const details = await client.matchmakingServers.pingServer(server.ip, server.port);
		const rules: Array<{ key: string; value: string }> = await client.matchmakingServers.serverRules(server.ip, server.port);
		return rules.length > 0 ? details.ping : null;
	} finally {
		list.release();
	}
}

// Example of timeline, screenshots and remotePlay: marks a highlight, hooks screenshots and invites a friend
export function markHighlightAndInvite(friend: bigint): boolean {
	const client = steamworks.init(480);
	const playing: timeline.TimelineGameMode = 0;
	const standard: timeline.TimelineEventClipPriority = 1;
	client.timeline.setGameMode(playing);
	client.timeline.addEvent('icon', 'Boss defeated', '', 0, -5, 5, standard);
	client.screenshots.hookScreenshots(true);
	const sessions = client.remotePlay.sessions();
	const width: number | null = sessions.length > 0 ? client.remotePlay.sessionDetails(sessions[0].sessionId).resolution?.width ?? null : null;
	return width !== null && client.remotePlay.invite(friend);
}

// Example of the supplemental namespaces: reads launch parameters, the Steam UI language and an analog stick, then shares a cloud file
export async function supplementalExample(name: string): Promise<string> {
	const client = steamworks.init(480);
	const mode: string = client.apps.launchQueryParam('mode');
	const language: string = client.utils.getUiLanguage();
	const overlay: boolean = client.utils.isOverlayEnabled();
	const controller: bigint = BigInt(0);
	const stick = client.input.getAnalogActionData(controller, BigInt(0));
	const pressed: boolean = client.input.getDigitalActionData(controller, BigInt(0)).state;
	const origins: number[] = client.input.getDigitalActionOrigins(controller, BigInt(0), BigInt(0));
	const label: string = origins.length > 0 ? client.input.getStringForActionOrigin(origins[0]) : '';
	const waiting: number = client.networking.isP2PPacketAvailableOnChannel(2);
	const platform: cloud.SyncPlatform = client.cloud.getSyncPlatforms(name);
	const handle: bigint = await client.cloud.shareFile(name);
	return `${mode}|${language}|${overlay}|${stick.x}|${pressed}|${label}|${waiting}|${platform}|${handle}`;
}
