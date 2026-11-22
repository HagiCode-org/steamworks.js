import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import starlightTypeDoc from "starlight-typedoc";
import { readFileSync } from "node:fs";
import hagilight from "@hagicode/hagilight-starlight";
import { hagilight as hagilightDiscovery } from "@hagicode/hagilight/integration";
import { locales as hagilightLocales } from "@hagicode/hagilight-starlight/locales";
import { guidePages } from "./scripts/page-map.mjs";

const siteUrl = "https://steamworks.hagicode.com";

// starlight-typedoc only puts the top-level members in its sidebar group, so the namespaces (nearly the
// whole API) would be reachable from the index page only. Build the group here instead: one entry per
// `export declare namespace` in client.d.ts, each listing its generated pages. The pages are written
// into src/content/docs/api by the plugin at build time; the directories keep the namespace's case (the built URLs are lower-case).
const namespaces = [...readFileSync(new URL("../client.d.ts", import.meta.url), "utf8").matchAll(/^export declare namespace (\w+)/gm)].map(
  (match) => match[1],
);
const apiSidebar = {
  label: "API reference",
  collapsed: true,
  items: [
    { label: "Overview", slug: "api" },
    ...namespaces.map((name) => ({
      label: name,
      collapsed: true,
      items: [{ autogenerate: { directory: `api/client/namespaces/${name}`, collapsed: true } }],
    })),
    { label: "Top-level functions", collapsed: true, items: [{ autogenerate: { directory: "api/functions" } }] },
    { label: "Top-level interfaces", collapsed: true, items: [{ autogenerate: { directory: "api/interfaces" } }] },
  ],
};

export default defineConfig({
  site: siteUrl,
  base: "/",
  integrations: [
    starlight({
      title: "steamworks.js",
      description: "Node.js and Electron bindings for the Steamworks SDK: Steam Workshop, achievements, stats, cloud, overlay and networking.",
      favicon: "https://cdn.jsdelivr.net/npm/@hagicode/hagilight-core@0.21.0/favicon.ico",
      defaultLocale: "root",
      locales: { root: hagilightLocales.root },
      customCss: ["./src/styles/site.css"],
      sidebar: [
        {
          label: "Guide",
          items: guidePages.map((page) => ({ label: page.title, slug: page.slug })),
        },
        {
          label: "Agent skills",
          // Starlight matches autogenerate against the file path under src/content/docs, so the
          // generated skill pages are found in generated/skills (their URLs stay /skills/<name>/).
          items: [{ autogenerate: { directory: "generated/skills" } }],
        },
        // The API reference is rendered from the JSDoc in ../client.d.ts (generated from the Rust doc comments).
        apiSidebar,
      ],
      social: [
        { icon: "github", label: "steamworks.js source", href: "https://github.com/HagiCode-org/steamworks.js" },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: ["../client.d.ts"],
          tsconfig: "./typedoc.tsconfig.json",
          output: "api",
          typeDoc: { entryFileName: "index", name: "client", disableSources: true, excludeInternal: true },
        }),
        hagilight({
          links: {
            siteId: "steamworks-docs",
            siteUrl: `${siteUrl}/`,
          },
          seo: {
            title: "steamworks.js",
            description: "Node.js and Electron bindings for the Steamworks SDK.",
            organization: { name: "HagiCode", url: "https://www.hagicode.com/" },
          },
          aiDisclosures: {
            sourceLocale: "en-US",
          },
          contentComponents: {
            pageTitle: false,
            markdownContent: false,
          },
        }),
      ],
    }),
    sitemap(),
    hagilightDiscovery(),
  ],
});
