// Page map: which README "##" sections become which guide page, and in what order.
//
// Every README "##" heading must appear in exactly one guide page's `sections`, or in
// `excludedSections`. import-sources.mjs fails the build naming any heading that is
// unmapped, and any mapped heading that no longer exists in README.md.
//
// Skill folders need no entry here: each folder with a SKILL.md becomes a page
// automatically. The router skill is always listed first (sidebar order 0).

export const guidePages = [
  {
    slug: "guide/getting-started",
    title: "Getting started",
    description: "Install steamworks.js and use its API, including the Electron setup.",
    order: 1,
    sections: ["API", "Installation"],
  },
  {
    slug: "guide/building",
    title: "Building and contributing",
    description: "Build steamworks.js from source and contribute changes.",
    order: 2,
    sections: ["How to build", "Contributing"],
  },
  {
    slug: "guide/workshop",
    title: "Steam Workshop",
    description: "Screenshots, previews, content updates, item dependencies, known game versions and multilingual items.",
    order: 3,
    sections: [
      "Workshop Screenshots (Additional Previews)",
      "Workshop Preview and Content Updates",
      "Workshop Item Dependencies",
      "Workshop Known Game Versions",
      "Workshop Multilingual Support",
    ],
  },
  {
    slug: "guide/social-and-stats",
    title: "Friends, stats and achievements",
    description: "Friends, stats, achievements and leaderboards.",
    order: 4,
    sections: ["Friends", "Stats, Achievements and Leaderboards"],
  },
  {
    slug: "guide/networking",
    title: "Networking and more",
    description: "Networking, the server browser, timeline, screenshots, remote play and supplemental functions.",
    order: 5,
    sections: [
      "Networking: `networking` and the New Namespaces",
      "Server Browser, Timeline, Screenshots and Remote Play",
      "Supplemental Functions",
    ],
  },
  {
    slug: "guide/releases",
    title: "Release process",
    description: "How steamworks.js releases are drafted and published.",
    order: 6,
    sections: ["Release Process"],
  },
];

// README "##" sections intentionally left off the site, with the reason.
export const excludedSections = {
  "About this fork": "The fork notice is covered by the landing page.",
};

export const skillRouter = "steamworks-js";

// Router first, then the other skills in their folder-name order (handled by the sidebar).
export function skillSidebarOrder(skillName) {
  return skillName === skillRouter ? 0 : 1;
}
