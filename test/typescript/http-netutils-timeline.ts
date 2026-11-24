import * as steamworks from "steamworks.js";
import type { http, networkingUtils, timeline } from "steamworks.js";

// Type-only examples for the HTTP, networking-utils and timeline functions. They are checked with
// `npx tsc --noEmit --strict http-netutils-timeline.ts`. Nothing here is run, and no Steam client is needed to type-check it.

// HTTP: one promise per request, with a cookie container shared between two requests.
export async function loginThenFetch(origin: string): Promise<http.HttpResponse> {
	const client = steamworks.init(480);
	const cookies: http.CookieContainer = client.http.createCookieContainer(true);
	cookies.setCookie("example.com", origin, "session=abc; Path=/");

	const login: http.HttpResponse = await client.http.request({
		method: "POST",
		url: `${origin}/api/login`,
		form: { user: "demo" },
		cookieContainer: cookies,
		responseHeaders: ["Set-Cookie"],
	});
	const status: number = login.status;
	const setCookie: string | undefined = login.headers["Set-Cookie"];
	const timedOut: boolean = login.wasTimedOut;

	const payload: http.RequestOptions = {
		method: "PUT",
		url: `${origin}/api/profile`,
		body: Buffer.from("{}"),
		contentType: "application/json",
		timeoutMs: 5000,
		userAgent: "example-client/1.0",
		requireVerifiedCertificate: true,
		cookieContainer: cookies,
	};
	const saved: http.HttpResponse = await client.http.request(payload);
	return status === 200 && !timedOut && setCookie !== undefined ? saved : login;
}

// Networking utils: ping locations, data centers and config values.
export async function pingSummary(): Promise<{ here: string | null; popCount: number; pops: networkingUtils.DataCenter[] }> {
	const client = steamworks.init(480);
	const local: networkingUtils.LocalPingLocation | null = client.networkingUtils.getLocalPingLocation();
	const pops: networkingUtils.DataCenter[] = client.networkingUtils.getPops();
	const estimate: number | null = local ? client.networkingUtils.estimatePingFromLocalHost(local.location) : null;
	const route: networkingUtils.DataCenterRoute | null = pops.length > 0 ? client.networkingUtils.getPingToDataCenter(pops[0].id) : null;
	const fake: networkingUtils.FakeIpType = client.networkingUtils.getIpv4FakeIpType(0);
	const normalized: string | null = client.networkingUtils.parsePingLocation(local?.location ?? "");
	void estimate;
	void route;
	void fake;
	void normalized;
	return { here: local?.location ?? null, popCount: client.networkingUtils.getPopCount(), pops };
}

// Config values: the value is a number, a BigInt (int64) or a string, depending on its type, or null when it does not exist.
export function tuneTimeouts(connection: number | null): boolean {
	const client = steamworks.init(480);
	const info: networkingUtils.ConfigValueInfo | null = client.networkingUtils.getConfigValueInfo(0);
	const current: number | bigint | string | null = client.networkingUtils.getConfigValue(0);
	const accepted: boolean = client.networkingUtils.setGlobalConfigValueInt32(0, 5000);
	const onConnection: boolean = connection === null ? true : client.networkingUtils.setConnectionConfigValueFloat(connection, 0, 1.5);
	return info !== null && current !== null && accepted && onConnection;
}

// Timeline: events and game phases. Event handles are BigInts, and null means the timeline is unavailable.
// The package re-exports its namespaces as types only, so the clip priority is written as its numeric value
// (0 None, 1 Standard, 2 Featured) with a type assertion instead of a `timeline.TimelineEventClipPriority.Featured` access.
export async function markBossFight(): Promise<bigint | null> {
	const client = steamworks.init(480);
	const featured = 2 as timeline.TimelineEventClipPriority;
	const standard = 1 as timeline.TimelineEventClipPriority;
	const event: bigint | null = client.timeline.startRangeTimelineEvent("Boss fight", "Round 1", "steam_victory", 0, 0, featured);
	if (event !== null) {
		client.timeline.updateRangeTimelineEvent(event, "Boss fight", "Round 2", "steam_victory", 0, standard);
		client.timeline.endRangeTimelineEvent(event, 0);
	}

	client.timeline.setGamePhaseId("chapter-1");
	client.timeline.addGamePhaseTag("Boss", "steam_victory", "Encounter", 0);
	const phase: timeline.GamePhaseRecordingExists = await client.timeline.doesGamePhaseRecordingExist("chapter-1");
	const answer: timeline.EventRecordingExists | null = event === null ? null : await client.timeline.doesEventRecordingExist(event);
	void phase;
	void answer;
	return event;
}
