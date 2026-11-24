import * as steamworks from "steamworks.js";
import type { achievement, apps, leaderboard, stats, utils } from "steamworks.js";

// Reads another user's stats after their stats are requested; a missing stat or an unloaded user comes back as null
export function readUserStats(steamId64: bigint): { kills: number | null; ratio: number | null } {
	const client = steamworks.init(480);
	client.stats.requestUserStats(steamId64);
	return {
		kills: client.stats.getUserInt(steamId64, "kills"),
		ratio: client.stats.getUserFloat(steamId64, "ratio"),
	};
}

// Adds to an average-rate stat (stored locally until store()), and reads the current player count
export async function recordSessionAndCount(): Promise<number> {
	const client = steamworks.init(480);
	client.stats.updateAvgRateStat("session_minutes", 1.5, 90);
	return client.stats.getNumberOfCurrentPlayers();
}

// Requests the global stats with 7 days of history, then reads the totals; int64 values are BigInts
export async function readGlobalStats(): Promise<{ total: bigint | null; daily: bigint[] | null; gameId: bigint }> {
	const client = steamworks.init(480);
	const gameId: bigint = await client.stats.requestGlobalStats(7);
	return {
		total: client.stats.getGlobalInt("total_kills"),
		daily: client.stats.getGlobalIntHistory("total_kills", 7),
		gameId,
	};
}

// The global ranking: the achievement list ordered by unlock percentage
export function rankAchievements(): achievement.AchievementRank[] {
	const client = steamworks.init(480);
	return client.achievement.getMostAchievedAchievements();
}

// Attaches cloud content to a leaderboard entry and downloads the entries of two users
export async function attachAndDownloadForUsers(board: leaderboard.Leaderboard, ugcHandle: bigint, users: bigint[]): Promise<leaderboard.LeaderboardEntry[]> {
	await board.attachUgc(ugcHandle);
	return board.downloadEntriesForUsers(users, 4);
}

// Reads the connection universe and checks a file signature; both enums keep the SDK numbers
export async function checkBuild(executablePath: string): Promise<boolean> {
	const client = steamworks.init(480);
	const universe: utils.Universe | null = client.utils.getConnectedUniverse();
	const status: utils.FileSignatureStatus = await client.utils.checkFileSignature(executablePath);
	// The enum values are the SDK numbers (EUniverse 1 = Public, ECheckFileSignature 1 = ValidSignature), cast as index.ts does
	return universe === (1 as utils.Universe) && status === (1 as utils.FileSignatureStatus);
}

// Filters a chat message from a Steam user after the filter dictionaries are loaded
export function filterChat(sourceSteamId64: bigint, message: string): string | null {
	const client = steamworks.init(480);
	client.utils.initFilterText();
	// ETextFilteringContext 2 = Chat
	const filtered: utils.FilteredText | null = client.utils.filterText(2 as utils.TextFilteringContext, sourceSteamId64, message);
	return filtered === null ? null : filtered.text;
}

// Reads the DLC list, the download progress of one DLC and the beta branches; progress bytes are BigInts
export function readDlcAndBetas(dlcAppId: number): { dlcs: apps.DlcInfo[]; progress: apps.DlcDownloadProgress | null; betas: apps.BetaBranch[] } {
	const client = steamworks.init(480);
	return {
		dlcs: client.apps.getDlcs(),
		progress: client.apps.getDlcDownloadProgress(dlcAppId),
		betas: client.apps.getBetas(),
	};
}

// Changes the local installation: installs a DLC and selects a beta branch (both need the user's confirmation in a real flow)
export function installDlcAndSelectBeta(dlcAppId: number, branch: string): boolean {
	const client = steamworks.init(480);
	client.apps.installDlc(dlcAppId);
	return client.apps.setActiveBeta(branch);
}

// Reads the size and SHA-1 of a file of the app; the SHA-1 is 40 lowercase hex characters
export async function readFileDetails(fileName: string): Promise<{ size: bigint; sha1: string }> {
	const client = steamworks.init(480);
	const details: apps.FileDetails = await client.apps.getFileDetails(fileName);
	return { size: details.size, sha1: details.sha1 };
}
