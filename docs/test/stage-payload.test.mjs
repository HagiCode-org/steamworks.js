import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stagePayload } from "../scripts/stage-payload.mjs";

function tempRepo({ withIndex = true, withEsa = true, withWrangler = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "steamworks-stage-test-"));
  const docsDir = path.join(root, "docs");
  const contracts = path.join(root, ".github", "gh-pages");
  mkdirSync(path.join(docsDir, "dist", "guide", "x"), { recursive: true });
  mkdirSync(contracts, { recursive: true });
  if (withIndex) writeFileSync(path.join(docsDir, "dist", "index.html"), "<html>home</html>");
  writeFileSync(path.join(docsDir, "dist", "guide", "x", "index.html"), "<html>guide</html>");
  if (withEsa) writeFileSync(path.join(contracts, "esa.jsonc"), '{"name":"steamworks-docs"}');
  if (withWrangler) writeFileSync(path.join(contracts, "wrangler.jsonc"), '{"name":"steamworks-docs"}');
  return { root, docsDir };
}

describe("stage-payload", () => {
  test("assembles esa.jsonc, wrangler.jsonc and dist/ at the repository root", () => {
    const { root, docsDir } = tempRepo();
    try {
      const target = stagePayload({ docsDir, repoRoot: root });
      assert.equal(target, path.join(root, ".deploy", "gh-pages"));
      assert.deepEqual(readdirSync(target).sort(), ["dist", "esa.jsonc", "wrangler.jsonc"]);
      assert.equal(readFileSync(path.join(target, "dist", "index.html"), "utf8"), "<html>home</html>");
      assert.equal(readFileSync(path.join(target, "dist", "guide", "x", "index.html"), "utf8"), "<html>guide</html>");
      assert.equal(readFileSync(path.join(target, "esa.jsonc"), "utf8"), '{"name":"steamworks-docs"}');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("restaging replaces the previous payload", () => {
    const { root, docsDir } = tempRepo();
    try {
      stagePayload({ docsDir, repoRoot: root });
      rmSync(path.join(docsDir, "dist", "guide"), { recursive: true, force: true });
      const target = stagePayload({ docsDir, repoRoot: root });
      assert.equal(existsSync(path.join(target, "dist", "guide")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a missing build index names docs/dist/index.html and stages nothing", () => {
    const { root, docsDir } = tempRepo({ withIndex: false });
    try {
      assert.throws(() => stagePayload({ docsDir, repoRoot: root }), /missing docs\/dist\/index\.html/);
      assert.equal(existsSync(path.join(root, ".deploy")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a missing esa.jsonc is named and stages nothing", () => {
    const { root, docsDir } = tempRepo({ withEsa: false });
    try {
      assert.throws(() => stagePayload({ docsDir, repoRoot: root }), /missing \.github\/gh-pages\/esa\.jsonc/);
      assert.equal(existsSync(path.join(root, ".deploy")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a missing wrangler.jsonc is named and stages nothing", () => {
    const { root, docsDir } = tempRepo({ withWrangler: false });
    try {
      assert.throws(() => stagePayload({ docsDir, repoRoot: root }), /missing \.github\/gh-pages\/wrangler\.jsonc/);
      assert.equal(existsSync(path.join(root, ".deploy")), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("several missing inputs are all named", () => {
    const { root, docsDir } = tempRepo({ withIndex: false, withEsa: false });
    try {
      assert.throws(
        () => stagePayload({ docsDir, repoRoot: root }),
        (error) => /docs\/dist\/index\.html/.test(error.message) && /esa\.jsonc/.test(error.message),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
