import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// These tests read the output of `pnpm run build`. Run them after a build (the verify script does).
const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(docsDir, "dist");
const siteUrl = "https://steamworks.hagicode.com";

function requireBuild() {
  assert.ok(existsSync(path.join(dist, "index.html")), "dist/index.html is missing: run `pnpm run build` first");
}

function walk(dir, predicate, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, found);
    else if (predicate(full)) found.push(full);
  }
  return found;
}

function htmlPages() {
  return walk(dist, (file) => file.endsWith(".html"));
}

function read(relative) {
  return readFileSync(path.join(dist, relative), "utf8");
}

// The page each internal href refers to, following the static-hosting rules the payload relies on.
function fileForHref(href) {
  const pathname = href.split("#")[0].split("?")[0];
  const candidates = pathname.endsWith("/")
    ? [`${pathname}index.html`]
    : [pathname, `${pathname}/index.html`, `${pathname}.html`];
  return candidates.map((candidate) => path.join(dist, candidate)).find((file) => existsSync(file) && statSync(file).isFile());
}

describe("built home page", () => {
  test("declares en-US and the root canonical URL", () => {
    requireBuild();
    const html = read("index.html");
    assert.match(html, /<html[^>]*lang="en-US"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="${siteUrl}/"`));
  });

  test("has no top-level locale directory", () => {
    requireBuild();
    const localeDirs = readdirSync(dist, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(name));
    assert.deepEqual(localeDirs, []);
  });

  test("carries the shared header, footer and theme picker", () => {
    requireBuild();
    const html = read("index.html");
    assert.match(html, /class="[^"]*header-links/, "shared header links missing");
    assert.match(html, /hagilight-copyright/, "shared footer missing");
    assert.match(html, /value="forest-dark"/, "theme picker options missing");
  });

  test("the shared header, footer and theme picker are on every documentation page", () => {
    requireBuild();
    for (const page of htmlPages().filter((file) => !file.endsWith("404.html"))) {
      const html = readFileSync(page, "utf8");
      assert.match(html, /header-links/, `${path.relative(dist, page)} has no shared header`);
      assert.match(html, /hagilight-copyright/, `${path.relative(dist, page)} has no shared footer`);
    }
  });

  test("produces a sitemap and the sitemap index", () => {
    requireBuild();
    assert.ok(existsSync(path.join(dist, "sitemap-index.xml")));
    const sitemap = readFileSync(path.join(dist, "sitemap-0.xml"), "utf8");
    assert.match(sitemap, new RegExp(`${siteUrl}/guide/getting-started/`));
  });

  test("publishes the hagilight discovery metadata under .well-known", () => {
    requireBuild();
    const metadata = JSON.parse(readFileSync(path.join(dist, ".well-known", "hagilight.metadata.json"), "utf8"));
    assert.ok(metadata && typeof metadata === "object");
  });

  test("ships a custom 404 page with the shared shell", () => {
    requireBuild();
    const html = read("404.html");
    assert.match(html, /header-links/);
    assert.match(html, /hagilight-copyright/);
  });

  test("the favicon is declared in the head of the home page and the 404 page", () => {
    requireBuild();
    for (const page of ["index.html", "404.html"]) {
      assert.match(read(page), /<link rel="(shortcut )?icon"/, `${page} has no favicon link`);
    }
  });
});

describe("navigation and links", () => {
  test("every generated guide and skill page is linked from the home page sidebar", () => {
    requireBuild();
    const sidebar = read("index.html").match(/<nav class="sidebar[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.match(sidebar, />Guide</);
    assert.match(sidebar, />Agent skills</);
    const generated = [
      ...readdirSync(path.join(dist, "guide"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `/guide/${e.name}/`),
      ...readdirSync(path.join(dist, "skills"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `/skills/${e.name}/`),
    ];
    assert.ok(generated.length >= 7, `expected the guide and skill pages, found ${generated.length}`);
    const linked = new Set([...sidebar.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
    const missing = generated.filter((url) => !linked.has(url));
    assert.deepEqual(missing, []);
  });

  test("no page links to a missing internal target", () => {
    requireBuild();
    const dead = [];
    for (const page of htmlPages()) {
      const html = readFileSync(page, "utf8");
      for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) {
        if (href.startsWith("//")) continue;
        if (!fileForHref(href)) dead.push(`${path.relative(dist, page)} -> ${href}`);
      }
    }
    assert.deepEqual(dead, []);
  });
});

describe("site stylesheet", () => {
  const css = readFileSync(path.join(docsDir, "src", "styles", "site.css"), "utf8");

  test("defines no colored side-stripe borders", () => {
    assert.doesNotMatch(css, /border-(left|right|inline-start|inline-end)\s*:\s*\d/);
  });

  test("any animation is limited to users who allow motion", () => {
    if (/animation\s*:|@keyframes/.test(css)) {
      assert.match(css, /prefers-reduced-motion/, "animation must be disabled under prefers-reduced-motion");
    }
  });

  test("has no glass-style translucent panels", () => {
    assert.doesNotMatch(css, /backdrop-filter/);
  });
});
