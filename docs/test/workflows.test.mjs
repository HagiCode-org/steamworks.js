import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// Contract tests for the docs CI and gh-pages publication workflows. They parse the YAML and check
// the rules in the steamworks.js docs specs, so a regression fails the docs test suite.
const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(docsDir, "..");
const ciFile = path.join(repoRoot, ".github", "workflows", "docs-ci.yml");
const deployFile = path.join(repoRoot, ".github", "workflows", "docs-deploy-gh-pages.yml");
const siteUrl = "https://steamworks.hagicode.com";
const mainRef = "github.ref == 'refs/heads/main'";
const docsPaths = [
  "docs/**",
  "README.md",
  "*/SKILL.md",
  ".github/gh-pages/**",
  ".github/workflows/docs-ci.yml",
  ".github/workflows/docs-deploy-gh-pages.yml",
];
const forbidden = /\bcargo\b|\bnapi\b|npm publish|pnpm publish|gh release|release-drafter|hagi-release|publish\.yml/;

const load = (file) => parse(readFileSync(file, "utf8"));
const stepsOf = (job) => job.steps ?? [];
const workingDirectory = (job, step) => step["working-directory"] ?? job.defaults?.run?.["working-directory"];
const sameList = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function verifyViolations(job, label) {
  const violations = [];
  const verify = stepsOf(job).find((step) => step.run === "pnpm run verify");
  if (!verify) violations.push(`${label} does not run "pnpm run verify"`);
  else if (workingDirectory(job, verify) !== "docs") violations.push(`${label} verify step must run in docs/`);
  const install = stepsOf(job).find((step) => step.run === "pnpm install --frozen-lockfile");
  if (!install) violations.push(`${label} does not install with --frozen-lockfile`);
  return violations;
}

function ciViolations(workflow) {
  const violations = [];
  if (workflow.permissions?.contents !== "read") violations.push("docs CI must have contents: read");
  const [job] = Object.values(workflow.jobs ?? {});
  if (!job) return [...violations, "docs CI has no job"];
  violations.push(...verifyViolations(job, "docs CI"));
  if (!sameList(workflow.on?.pull_request?.paths ?? [], docsPaths)) violations.push("docs CI pull_request paths differ");
  if (!sameList(workflow.on?.push?.paths ?? [], docsPaths)) violations.push("docs CI push paths differ");
  if (!(workflow.on?.push?.branches ?? []).includes("main")) violations.push("docs CI must run on pushes to main");
  return violations;
}

function deployViolations(workflow) {
  const violations = [];
  const build = workflow.jobs?.build;
  const deploy = workflow.jobs?.deploy;
  if (!build) return ["missing build job"];
  if (!deploy) return ["missing deploy job"];

  if (build.permissions?.contents !== "read") violations.push("build job must have contents: read");
  if (deploy.permissions?.contents !== "write") violations.push("deploy job must have contents: write");
  if (build.if !== mainRef) violations.push("build job must be limited to main");
  if (deploy.if !== mainRef) violations.push("deploy job must be limited to main");
  const needs = Array.isArray(deploy.needs) ? deploy.needs : [deploy.needs];
  if (!needs.includes("build")) violations.push("deploy job must need build");

  violations.push(...verifyViolations(build, "publication build job"));
  if (!stepsOf(build).some((step) => step.run === "node scripts/stage-payload.mjs")) {
    violations.push("build job must stage the payload");
  }
  const upload = stepsOf(build).find((step) => step.uses?.startsWith("actions/upload-artifact"));
  if (!upload) violations.push("build job must upload the payload as an artifact");
  else if (upload.with?.["include-hidden-files"] !== true) violations.push("upload must include hidden files");

  const deployRuns = stepsOf(deploy).map((step) => step.run ?? "");
  if (deployRuns.some((run) => /build|install|astro/.test(run))) {
    violations.push("deploy job must not rebuild the site");
  }
  if (!stepsOf(deploy).some((step) => step.uses?.startsWith("actions/download-artifact"))) {
    violations.push("deploy job must download the artifact");
  }
  const publish = stepsOf(deploy).find((step) => step.uses?.startsWith("peaceiris/actions-gh-pages"));
  if (!publish) violations.push("deploy job must publish with peaceiris/actions-gh-pages");
  else {
    if (publish.with?.force_orphan !== true) violations.push("publication must set force_orphan: true");
    if (publish.with?.enable_jekyll !== false) violations.push("publication must set enable_jekyll: false");
    if (publish.with?.publish_branch !== "gh-pages") violations.push("publication must target gh-pages");
  }
  if (!stepsOf(deploy).some((step) => step.if === "always()")) violations.push("deploy job must write a run summary even on failure");
  if (deploy.environment?.url !== siteUrl) violations.push(`deploy environment URL must be ${siteUrl}`);

  if (workflow.concurrency?.["cancel-in-progress"] !== false) violations.push("publication must not cancel an in-progress run");
  if (workflow.on?.pull_request !== undefined) violations.push("publication must not start for pull requests");
  if (!("workflow_dispatch" in (workflow.on ?? {}))) violations.push("publication must allow manual dispatch");
  if (!sameList(workflow.on?.push?.paths ?? [], docsPaths)) violations.push("publication push paths differ");
  if (!(workflow.on?.push?.branches ?? []).includes("main")) violations.push("publication must start from main");
  return violations;
}

describe("docs CI workflow", () => {
  test("runs the verify gate in docs/ with frozen installs on PRs and main", () => {
    assert.deepEqual(ciViolations(load(ciFile)), []);
  });
});

describe("gh-pages publication workflow", () => {
  test("build verifies and stages, deploy publishes the artifact without rebuilding", () => {
    assert.deepEqual(deployViolations(load(deployFile)), []);
  });

  test("the CI gate and the publication build run the same verification steps", () => {
    const ci = Object.values(load(ciFile).jobs)[0];
    const build = load(deployFile).jobs.build;
    const sequence = (job) => stepsOf(job).filter((step) => typeof step.run === "string").map((step) => step.run);
    assert.deepEqual(sequence(ci).slice(0, 2), sequence(build).slice(0, 2));
    assert.deepEqual(sequence(ci).slice(0, 2), ["pnpm install --frozen-lockfile", "pnpm run verify"]);
  });

  test("the docs workflows contain no native build, npm publish or release steps", () => {
    const offenders = [];
    for (const file of [ciFile, deployFile]) {
      const workflow = load(file);
      for (const job of Object.values(workflow.jobs)) {
        for (const step of stepsOf(job)) {
          const text = `${step.run ?? ""} ${step.uses ?? ""}`;
          if (forbidden.test(text)) offenders.push(`${path.basename(file)}: ${text.trim()}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  test("docs and root use the same pnpm version", () => {
    const root = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    const docs = JSON.parse(readFileSync(path.join(docsDir, "package.json"), "utf8"));
    assert.equal(docs.packageManager, root.packageManager);
  });

  test("the contract files name the site and serve ./dist", () => {
    for (const file of ["esa.jsonc", "wrangler.jsonc"]) {
      const json = JSON.parse(readFileSync(path.join(repoRoot, ".github", "gh-pages", file), "utf8"));
      assert.equal(json.name, "steamworks-docs", file);
      assert.equal(json.assets.directory, "./dist", file);
    }
  });

  test("a scratch copy without force_orphan is rejected", () => {
    const scratch = mkdtempSync(path.join(os.tmpdir(), "steamworks-workflow-test-"));
    try {
      const text = readFileSync(deployFile, "utf8");
      const mutated = text.replace(/^\s*force_orphan: true\n/m, "");
      assert.notEqual(mutated, text, "the fixture line was not found");
      const file = path.join(scratch, "docs-deploy-gh-pages.yml");
      writeFileSync(file, mutated);
      assert.ok(deployViolations(load(file)).some((message) => /force_orphan/.test(message)));
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("a scratch copy that rebuilds in deploy or cancels runs is rejected", () => {
    const workflow = load(deployFile);
    workflow.jobs.deploy.steps.push({ run: "pnpm run build" });
    workflow.concurrency["cancel-in-progress"] = true;
    const violations = deployViolations(workflow);
    assert.ok(violations.some((message) => /rebuild/.test(message)));
    assert.ok(violations.some((message) => /cancel/.test(message)));
  });
});
