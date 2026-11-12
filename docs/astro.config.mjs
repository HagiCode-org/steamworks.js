import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import hagilight from "@hagicode/hagilight-starlight";
import { hagilight as hagilightDiscovery } from "@hagicode/hagilight/integration";
import { locales as hagilightLocales } from "@hagicode/hagilight-starlight/locales";
import { guidePages } from "./scripts/page-map.mjs";

const siteUrl = "https://steamworks.hagicode.com";

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
      ],
      social: [
        { icon: "github", label: "steamworks.js source", href: "https://github.com/HagiCode-org/steamworks.js" },
      ],
      plugins: [
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
