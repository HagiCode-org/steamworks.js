// Offline checks for the ISteamFriends additions: groups, clans, clan chat, friend chat, follows, profile items and
// rich presence reads. No Steam client and no AppID are needed, and nothing here calls a function that needs init().
const assert = require('node:assert/strict')

// Load this platform's native binding directly, the same way test/offline-smoke-test.js does.
const bindingPaths = {
    'win32-x64': '../dist/win64/steamworksjs.win32-x64-msvc.node',
    'linux-x64': '../dist/linux64/steamworksjs.linux-x64-gnu.node',
    'darwin-x64': '../dist/osx/steamworksjs.darwin-x64.node',
    'darwin-arm64': '../dist/osx/steamworksjs.darwin-arm64.node',
}
const nativeBinding = require(bindingPaths[`${process.platform}-${process.arch}`])
const friends = nativeBinding.friends

// Functions added to the friends namespace, in the order of the ISteamFriends header.
const addedFunctions = [
    // persona, relationship, names and levels
    'getPersonaState',
    'getFriendRelationship',
    'getFriendPersonaNameHistory',
    'getFriendSteamLevel',
    // friends groups
    'getFriendsGroupCount',
    'getFriendsGroupId',
    'getFriendsGroupName',
    'getFriendsGroupMembersCount',
    'getFriendsGroupMembers',
    'getFriendGroups',
    // clans
    'getClanCount',
    'getClanByIndex',
    'getClanName',
    'getClanTag',
    'getClanActivityCounts',
    'getClans',
    'getClanOwner',
    'getClanOfficerCount',
    'getClanOfficerByIndex',
    'isClanPublic',
    'isClanOfficialGameGroup',
    'downloadClanActivityCounts',
    'requestClanOfficerList',
    'getClanInfo',
    // sources and voice
    'getFriendCountFromSource',
    'getFriendFromSourceByIndex',
    'isUserInSource',
    'setInGameVoiceSpeaking',
    // overlay
    'getNumChatsWithUnreadPriorityMessages',
    'activateRemotePlayTogetherInviteDialog',
    'registerProtocolInOverlayBrowser',
    // clan chat
    'joinClanChatRoom',
    'leaveClanChatRoom',
    'getClanChatMemberCount',
    'getClanChatMemberByIndex',
    'sendClanChatMessage',
    'getClanChatMessage',
    'isClanChatAdmin',
    'isClanChatWindowOpenInSteam',
    'openClanChatWindowInSteam',
    'closeClanChatWindowInSteam',
    // friend chat
    'setListenForFriendsMessages',
    'replyToFriendMessage',
    'getFriendMessage',
    // follows
    'getFollowerCount',
    'isFollowing',
    'enumerateFollowingList',
    // profile items
    'requestEquippedProfileItems',
    'hasEquippedProfileItem',
    'getProfileItemPropertyString',
    'getProfileItemPropertyUint',
    // rich presence reads
    'requestFriendRichPresence',
    'getFriendRichPresence',
    'getFriendRichPresenceKeyCount',
    'getFriendRichPresenceKey',
]

for (const name of addedFunctions) {
    assert.equal(typeof friends[name], 'function', `friends.${name} is exported`)
}
assert.equal(addedFunctions.length, new Set(addedFunctions).size, 'no function name is listed twice')

// The functions that already existed stay exported.
for (const name of [
    'getFriends',
    'getCoplayFriends',
    'getFriendState',
    'getFriendGamePlayed',
    'getFriendCoplayInfo',
    'getSmallAvatar',
    'getMediumAvatar',
    'getLargeAvatar',
    'requestUserInformation',
    'clearRichPresence',
    'inviteUserToGame',
    'setPlayedWith',
]) {
    assert.equal(typeof friends[name], 'function', `friends.${name} is still exported`)
}

// Enums: numeric values follow the SDK numbers, so a JavaScript caller can compare them with the header.
assert.equal(friends.FriendRelationship.None, 0, 'FriendRelationship.None is 0')
assert.equal(friends.FriendRelationship.Friend, 3, 'FriendRelationship.Friend is 3')
assert.equal(friends.FriendRelationship.IgnoredFriend, 6, 'FriendRelationship.IgnoredFriend is 6')
assert.equal(friends.ChatEntryType.ChatMsg, 1, 'ChatEntryType.ChatMsg is 1')
assert.equal(friends.ChatEntryType.LinkBlocked, 14, 'ChatEntryType.LinkBlocked is 14')
assert.equal(friends.ChatRoomEnterResponse.Success, 1, 'ChatRoomEnterResponse.Success is 1')
assert.equal(friends.ChatRoomEnterResponse.RatelimitExceeded, 12, 'ChatRoomEnterResponse.RatelimitExceeded is 12')
assert.equal(friends.ProfileItemType.AnimatedAvatar, 0, 'ProfileItemType.AnimatedAvatar is 0')
assert.equal(friends.ProfileItemType.MiniProfileBackground, 4, 'ProfileItemType.MiniProfileBackground is 4')
assert.equal(friends.ProfileItemProperty.ImageSmall, 0, 'ProfileItemProperty.ImageSmall is 0')
assert.equal(friends.ProfileItemProperty.AppId, 5, 'ProfileItemProperty.AppId is 5')
assert.equal(friends.ProfileItemProperty.MovieMp4Small, 11, 'ProfileItemProperty.MovieMp4Small is 11')

// Callback kinds added for the friends interface. They are appended after the earlier values, so the numbers are stable.
const callbackEnum = nativeBinding.callback.SteamCallback
for (const [name, value] of [
    ['GameConnectedFriendChatMsg', 24],
    ['GameConnectedClanChatMsg', 25],
    ['GameConnectedChatJoin', 26],
    ['GameConnectedChatLeave', 27],
    ['FriendRichPresenceUpdate', 28],
    ['UnreadChatMessagesChanged', 29],
    ['OverlayBrowserProtocolNavigation', 30],
    ['EquippedProfileItemsChanged', 31],
]) {
    assert.equal(callbackEnum[name], value, `SteamCallback.${name} is ${value}`)
}
