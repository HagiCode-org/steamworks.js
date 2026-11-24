import * as steamworks from "steamworks.js";
import type { cloud, localplayer } from "steamworks.js";

// Type-only examples of the ISteamUser and ISteamRemoteStorage additions. They are checked by
// `tsc --noEmit --strict user-remotestorage.ts`, not run. The package exports these namespaces as types only,
// so enum members are written as their numeric values, typed with the enum type.

// Returns the Steam user handle and the user data folder (null when Steam returns none)
export function readUserHandles(): { hUser: number; dataFolder: string | null } {
	const client = steamworks.init(480);
	return {
		hUser: client.localplayer.getHSteamUser(),
		dataFolder: client.localplayer.getUserDataFolder(),
	};
}

// Records an app usage event; the game id is a BigInt and the extra info is optional
export function trackUsage(): void {
	const client = steamworks.init(480);
	const event: number = 1;
	client.localplayer.trackAppUsageEvent(480n, event, "tutorial");
	client.localplayer.trackAppUsageEvent(480n, event);
}

// Records a voice chunk; the result is a VoiceResult member, and data is a Buffer
export function recordVoice(): localplayer.VoiceChunk {
	const client = steamworks.init(480);
	client.localplayer.startVoiceRecording();
	const available: localplayer.VoiceAvailable = client.localplayer.getAvailableVoice();
	const chunk: localplayer.VoiceChunk = client.localplayer.getVoice();
	client.localplayer.stopVoiceRecording();
	return available.compressedBytes > 0 ? chunk : { result: available.result, data: Buffer.alloc(0) };
}

// Decodes a compressed voice buffer at the optimal sample rate
export function decodeVoice(compressed: Buffer): Buffer {
	const client = steamworks.init(480);
	const sampleRate: number = client.localplayer.getVoiceOptimalSampleRate();
	return client.localplayer.decompressVoice(compressed, sampleRate).data;
}

// Network, badge and phone or 2FA checks: booleans and numbers
export function accountChecks(): boolean {
	const client = steamworks.init(480);
	const badge: number = client.localplayer.getGameBadgeLevel(1, false);
	client.localplayer.advertiseGame(76561198000000000n, "192.0.2.10", 27015);
	return (
		badge >= 0 &&
		(client.localplayer.isBehindNat() ||
			client.localplayer.isPhoneVerified() ||
			client.localplayer.isTwoFactorEnabled() ||
			client.localplayer.isPhoneIdentifying() ||
			client.localplayer.isPhoneRequiringVerification())
	);
}

// Async market and playtime calls; the online state is a DurationControlOnlineState member
export async function readMarketAndDuration(): Promise<localplayer.DurationControl> {
	const client = steamworks.init(480);
	const market: localplayer.MarketEligibility = await client.localplayer.getMarketEligibility();
	const online: localplayer.DurationControlOnlineState = 2;
	client.localplayer.setDurationControlOnlineState(online);
	const control: localplayer.DurationControl = await client.localplayer.getDurationControl();
	if (!market.allowed) {
		throw new Error("the account is not allowed to use the market");
	}
	return control;
}

// Store eligibility flags, as a boolean list
export function marketFlags(market: localplayer.MarketEligibility): boolean[] {
	return [market.allowed, market.notAllowedReasons !== 0];
}

// Encrypted app ticket and store URL; the ticket is a Buffer or null
export async function ticketAndStoreUrl(): Promise<string> {
	const client = steamworks.init(480);
	await client.auth.requestEncryptedAppTicket(Buffer.from("extra"));
	const ticket: Buffer | null = client.auth.getEncryptedAppTicket();
	const url: string = await client.auth.requestStoreAuthUrl("https://example.com/done");
	return ticket === null ? "" : url;
}

// Cloud quota, batch writes and file changes from other devices
export async function syncCloud(): Promise<cloud.LocalFileChange[]> {
	const client = steamworks.init(480);
	const quota: cloud.CloudQuota | null = client.cloud.getQuota();
	await client.cloud.writeFileAsync("save.json", Buffer.from("{}"));
	client.cloud.beginFileWriteBatch();
	client.cloud.endFileWriteBatch();
	const changes: cloud.LocalFileChange[] = client.cloud.getLocalFileChanges();
	const updated: cloud.LocalFileChangeType = 1;
	const absolute: cloud.FilePathType = 1;
	return quota === null ? [] : changes.filter((change) => change.changeType === updated && change.pathType === absolute);
}

// Chunked write stream; close commits, cancel discards
export function writeInChunks(): boolean {
	const client = steamworks.init(480);
	const stream: cloud.FileWriteStream = client.cloud.openWriteStream("save.bin");
	const first: boolean = stream.writeChunk(Buffer.from("part one"));
	const second: boolean = stream.writeChunk(Buffer.from("part two"));
	return first && second && stream.close();
}

// Downloads a UGC file, reads its progress and details
export async function downloadWorkshopFile(handle: bigint): Promise<cloud.UgcDetails | null> {
	const client = steamworks.init(480);
	const result: cloud.UgcDownloadResult = await client.cloud.downloadUgc(handle, 0);
	const toLocation: cloud.UgcDownloadResult = await client.cloud.downloadUgcToLocation(handle, "C:/tmp/file.bin", 0);
	const progress: cloud.UgcDownloadProgress | null = client.cloud.getUgcDownloadProgress(handle);
	const done: boolean = progress !== null && progress.bytesExpected > 0 && progress.bytesDownloaded >= progress.bytesExpected;
	return done && toLocation.handle === result.handle ? client.cloud.getUgcDetails(result.handle) : null;
}

// Reads part of a cached UGC file into a buffer and closes the handle afterwards
export function readCachedFile(handle: bigint): number | null {
	const client = steamworks.init(480);
	const buffer = Buffer.alloc(1024);
	const cached: bigint | null = client.cloud.getCachedUgcHandle(0);
	const action: cloud.UgcReadAction = 2;
	return client.cloud.readUgc(cached ?? handle, buffer, 0, action);
}
