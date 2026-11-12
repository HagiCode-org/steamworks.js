import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO_URL,
  buildGuidePage,
  buildPages,
  buildSkillPage,
  checkCoverage,
  generateSite,
  markFences,
  rewriteLinks,
  splitReadme,
} from "../scripts/import-sources.mjs";
import { excludedSections, guidePages } from "../scripts/page-map.mjs";

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(docsDir, "..");

function tempDir() {
  return mkdtempSync(path.join(os.tmpdir(), "steamworks-docs-test-"));
}

function writeFiles(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

// A README that contains every heading the page map expects, each with a short body.
function mappedReadme(bodies = {}) {
  const headings = [...guidePages.flatMap((page) => page.sections), ...Object.keys(excludedSections)];
  return [
    "# Title",
    "",
    "[![badge](https://img.shields.io/badge/x-y-z.svg)](https://example.com)",
    "",
    ...headings.flatMap((heading) => [`## ${heading}`, "", bodies[heading] ?? `Body of ${heading}.`, ""]),
  ].join("\n");
}

function skillMd(name, description, body = "Skill body.") {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${body}\n`;
}

function snapshot(dir) {
  const files = {};
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[path.relative(dir, full)] = readFileSync(full, "utf8");
    }
  };
  if (existsSync(dir)) walk(dir);
  return files;
}

const linkContext = (root, extra = {}) => ({
  source: "README.md",
  baseDir: "",
  repoRoot: root,
  skills: new Set(["steamworks-js"]),
  anchors: new Map([["installation", "/guide/getting-started/#installation"]]),
  ...extra,
});

describe("README splitting", () => {
  test("only ## lines outside code fences start a section", () => {
    const sections = splitReadme("# T\n\n## Alpha\n\n```md\n## Not a section\n```\n\n## Beta\n\nText.\n");
    assert.deepEqual(sections.map((s) => s.heading), ["Alpha", "Beta"]);
    assert.equal(sections[0].raw, "## Alpha\n\n```md\n## Not a section\n```");
  });

  test("code fences and tables survive exactly", () => {
    const section = "## Alpha\n\n| a | b |\n| - | - |\n| 1 | `x` |\n\n~~~ts\nconst a = '## keep';\n~~~";
    const [alpha] = splitReadme(`# T\n\n${section}\n\n## Beta\n\nBody.\n`);
    assert.equal(alpha.raw, section);
  });

  test("an unclosed code fence fails naming the line", () => {
    assert.throws(() => splitReadme("## Alpha\n\n```js\nno end\n"), /line 3 is never closed/);
  });

  test("a duplicate heading fails naming it", () => {
    assert.throws(() => splitReadme("## Alpha\n\nx\n\n## Alpha\n\ny\n"), /"Alpha" appears more than once/);
  });

  test("guide page lists its sections in page-map order, not README order", () => {
    const sections = splitReadme("## B\n\nb body\n\n## A\n\na body\n");
    const page = { slug: "guide/x", title: "X", description: "d", sections: ["A", "B"] };
    const out = buildGuidePage(page, sections, linkContext(repoRoot));
    assert.ok(out.indexOf("## A") < out.indexOf("## B"));
    assert.match(out, /title: "X"/);
  });
});

describe("page map coverage", () => {
  test("an unmapped ## heading fails naming it", () => {
    const sections = splitReadme(`${mappedReadme()}\n## Brand New\n\nx\n`);
    assert.throws(() => checkCoverage(sections), /unmapped README "## " heading\(s\): "Brand New"/);
  });

  test("a renamed heading fails naming both the new and the missing heading", () => {
    const sections = splitReadme(mappedReadme().replace("## Release Process", "## Shipping"));
    assert.throws(
      () => checkCoverage(sections),
      (error) => /"Shipping"/.test(error.message) && /not found in README\.md: "Release Process"/.test(error.message),
    );
  });

  test("an excluded heading needs no page", () => {
    assert.doesNotThrow(() => checkCoverage(splitReadme(mappedReadme())));
  });

  test("the real README is fully covered by the page map", () => {
    const sections = splitReadme(readFileSync(path.join(repoRoot, "README.md"), "utf8"));
    assert.doesNotThrow(() => checkCoverage(sections));
  });
});

describe("skill pages", () => {
  test("frontmatter becomes title and description, the skill H1 is dropped, the router is first", () => {
    const context = { source: "steamworks-js/SKILL.md", baseDir: "steamworks-js", repoRoot, skills: new Set(["steamworks-js"]), anchors: new Map() };
    const page = buildSkillPage({ folder: "steamworks-js", text: skillMd("steamworks-js", "Routes work."), context });
    assert.match(page, /^---\ntitle: "steamworks-js"\ndescription: "Routes work\."\nslug: skills\/steamworks-js\nsidebar:\n  order: 0\n---\n/);
    assert.equal(/^# steamworks-js/m.test(page), false);
    assert.match(page, /Skill body\./);
  });

  test("other skills sort after the router", () => {
    const context = { source: "steamworks-workshop-query/SKILL.md", baseDir: "steamworks-workshop-query", repoRoot, skills: new Set(), anchors: new Map() };
    const page = buildSkillPage({ folder: "steamworks-workshop-query", text: skillMd("steamworks-workshop-query", "Queries."), context });
    assert.match(page, /sidebar:\n  order: 1\n/);
  });

  test("missing frontmatter fails naming the file", () => {
    const context = { source: "steamworks-x/SKILL.md", baseDir: "steamworks-x", repoRoot, skills: new Set(), anchors: new Map() };
    assert.throws(
      () => buildSkillPage({ folder: "steamworks-x", text: "# no frontmatter\n", context }),
      /steamworks-x\/SKILL\.md: missing frontmatter/,
    );
  });

  test("frontmatter without a description fails naming the file", () => {
    const context = { source: "steamworks-x/SKILL.md", baseDir: "steamworks-x", repoRoot, skills: new Set(), anchors: new Map() };
    assert.throws(
      () => buildSkillPage({ folder: "steamworks-x", text: "---\nname: steamworks-x\n---\n\n# x\n", context }),
      /steamworks-x\/SKILL\.md: frontmatter must define "description"/,
    );
  });

  test("a name that differs from its folder fails naming the file", () => {
    const context = { source: "steamworks-x/SKILL.md", baseDir: "steamworks-x", repoRoot, skills: new Set(), anchors: new Map() };
    assert.throws(
      () => buildSkillPage({ folder: "steamworks-x", text: skillMd("steamworks-y", "d"), context }),
      /must match its folder "steamworks-x"/,
    );
  });

  test("a new skill folder is discovered without touching the page map", () => {
    const root = tempDir();
    try {
      writeFiles(root, {
        "README.md": mappedReadme(),
        "steamworks-js/SKILL.md": skillMd("steamworks-js", "Router."),
        "steamworks-brand-new/SKILL.md": skillMd("steamworks-brand-new", "New skill."),
      });
      const pages = buildPages(root);
      assert.ok(pages.has("skills/steamworks-brand-new.md"));
      assert.match(pages.get("skills/steamworks-brand-new.md"), /title: "steamworks-brand-new"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("link rewriting", () => {
  test("a #anchor points to the page that holds the heading", () => {
    const out = rewriteLinks("See [install](#installation).", linkContext(repoRoot));
    assert.equal(out, "See [install](/guide/getting-started/#installation).");
  });

  test("a sibling SKILL.md becomes the skill page", () => {
    const context = linkContext(repoRoot, { source: "steamworks-workshop-query/SKILL.md", baseDir: "steamworks-workshop-query" });
    assert.equal(rewriteLinks("[router](../steamworks-js/SKILL.md)", context), "[router](/skills/steamworks-js/)");
  });

  test("a repository file becomes a blob link and a directory a tree link", () => {
    const root = tempDir();
    try {
      writeFiles(root, { "CONTRIBUTING.md": "c", "test/electron/index.js": "x" });
      const out = rewriteLinks("[c](./CONTRIBUTING.md) and [d](./test/electron)", linkContext(root));
      assert.equal(out, `[c](${REPO_URL}/blob/main/CONTRIBUTING.md) and [d](${REPO_URL}/tree/main/test/electron)`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("absolute URLs and mailto links are unchanged", () => {
    const text = "[a](https://example.com/x) [b](http://example.com) [c](mailto:me@example.com)";
    assert.equal(rewriteLinks(text, linkContext(repoRoot)), text);
  });

  test("code fences and inline code are not touched", () => {
    const text = "Use `[f](./nope.md)` here.\n\n```md\n[g](./nope.md)\n```\n";
    assert.equal(rewriteLinks(text, linkContext(repoRoot)), text);
  });

  test("a missing repository target fails naming the source and the link", () => {
    assert.throws(
      () => rewriteLinks("[x](./nope.md)", linkContext(repoRoot)),
      /README\.md: link "\.\/nope\.md" points to a repository path that does not exist/,
    );
  });

  test("an unknown anchor fails naming the source and the link", () => {
    assert.throws(() => rewriteLinks("[x](#no-such)", linkContext(repoRoot)), /README\.md: link "#no-such"/);
  });

  test("the real repository files leave no relative link after import", () => {
    const pages = buildPages(repoRoot);
    const offenders = [];
    for (const [relative, content] of pages) {
      for (const { line, code } of markFences(content.split("\n"), relative)) {
        if (code) continue;
        for (const match of line.replace(/`[^`]*`/g, "").matchAll(/\]\(([^()\s]+)/g)) {
          if (!/^(https?:|mailto:|\/|#)/.test(match[1])) offenders.push(`${relative}: ${match[1]}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe("atomic generation", () => {
  test("a stale page disappears after its source is removed", () => {
    const root = tempDir();
    const outDir = path.join(root, "out");
    const tmpBase = path.join(root, "tmp");
    try {
      writeFiles(root, {
        "src/README.md": mappedReadme(),
        "src/steamworks-js/SKILL.md": skillMd("steamworks-js", "Router."),
        "src/steamworks-old/SKILL.md": skillMd("steamworks-old", "Old skill."),
      });
      const sourceRoot = path.join(root, "src");
      generateSite({ repoRoot: sourceRoot, outDir, tmpBase });
      assert.ok(existsSync(path.join(outDir, "skills/steamworks-old.md")));
      rmSync(path.join(sourceRoot, "steamworks-old"), { recursive: true, force: true });
      generateSite({ repoRoot: sourceRoot, outDir, tmpBase });
      assert.equal(existsSync(path.join(outDir, "skills/steamworks-old.md")), false);
      assert.ok(existsSync(path.join(outDir, "skills/steamworks-js.md")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a failing run leaves the previous output and no temporary tree", () => {
    const root = tempDir();
    const outDir = path.join(root, "out");
    const tmpBase = path.join(root, "tmp");
    try {
      writeFiles(root, {
        "src/README.md": mappedReadme(),
        "src/steamworks-js/SKILL.md": skillMd("steamworks-js", "Router."),
      });
      const sourceRoot = path.join(root, "src");
      generateSite({ repoRoot: sourceRoot, outDir, tmpBase });
      const before = snapshot(outDir);
      writeFiles(root, { "src/README.md": `${mappedReadme()}\n\`\`\`\nnever closed\n` });
      assert.throws(() => generateSite({ repoRoot: sourceRoot, outDir, tmpBase }), /never closed/);
      assert.deepEqual(snapshot(outDir), before);
      assert.deepEqual(existsSync(tmpBase) ? readdirSync(tmpBase) : [], []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a missing README stops generation before any page is written", () => {
    const root = tempDir();
    const outDir = path.join(root, "out");
    const tmpBase = path.join(root, "tmp");
    try {
      writeFiles(root, { "src/steamworks-js/SKILL.md": skillMd("steamworks-js", "Router.") });
      assert.throws(() => generateSite({ repoRoot: path.join(root, "src"), outDir, tmpBase }), /cannot read README\.md/);
      assert.equal(existsSync(outDir), false);
      assert.equal(existsSync(tmpBase), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
