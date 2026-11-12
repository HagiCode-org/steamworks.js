// Assembles the gh-pages publication payload from a finished build:
//   .deploy/gh-pages/esa.jsonc
//   .deploy/gh-pages/wrangler.jsonc
//   .deploy/gh-pages/dist/        (copy of docs/dist)
// The payload directory sits at the repository root, as the publish workflow expects.
// It exits non-zero, naming each missing input, before anything is written.

import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDocsDir = path.resolve(scriptsDir, "..");
const defaultRepoRoot = path.resolve(defaultDocsDir, "..");

export function stagePayload({ docsDir = defaultDocsDir, repoRoot = defaultRepoRoot } = {}) {
  const contracts = path.join(repoRoot, ".github", "gh-pages");
  const inputs = [
    { label: "docs/dist/index.html", file: path.join(docsDir, "dist", "index.html") },
    { label: ".github/gh-pages/esa.jsonc", file: path.join(contracts, "esa.jsonc") },
    { label: ".github/gh-pages/wrangler.jsonc", file: path.join(contracts, "wrangler.jsonc") },
  ];
  const missing = inputs.filter((input) => !existsSync(input.file)).map((input) => input.label);
  if (missing.length) {
    throw new Error(`stage-payload: missing ${missing.join(", ")}; run the build and check the contract files`);
  }

  const target = path.join(repoRoot, ".deploy", "gh-pages");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  copyFileSync(path.join(contracts, "esa.jsonc"), path.join(target, "esa.jsonc"));
  copyFileSync(path.join(contracts, "wrangler.jsonc"), path.join(target, "wrangler.jsonc"));
  cpSync(path.join(docsDir, "dist"), path.join(target, "dist"), { recursive: true });
  return target;
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const target = stagePayload();
    console.log(`stage-payload: staged ${path.relative(process.cwd(), target) || target}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
