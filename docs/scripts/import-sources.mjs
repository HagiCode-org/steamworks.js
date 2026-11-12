// Builds the guide and skill pages of the documentation site from the repository's own
// README.md and */SKILL.md files. Nothing generated is committed: `pnpm run import:sources`
// writes src/content/docs/generated/, which is git-ignored.
//
// Every source is read and validated in memory before anything is written, and the output
// is swapped in as a whole, so a failing run never leaves a partial or stale tree behind.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import GithubSlugger from "github-slugger";
import { excludedSections, guidePages, skillSidebarOrder } from "./page-map.mjs";

export const REPO_URL = "https://github.com/HagiCode-org/steamworks.js";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(scriptsDir, "..");
const defaultRepoRoot = path.resolve(docsDir, "..");
const defaultOutDir = path.join(docsDir, "src", "content", "docs", "generated");
const defaultTmpBase = path.join(docsDir, ".astro", "import-sources");

// Marks each line as code (inside or on a fence) or prose. Fences are closed by a marker of the
// same character with at least the same length; an unclosed fence is an error.
export function markFences(lines, source = "source") {
  let open = null;
  const marked = lines.map((line, index) => {
    if (open) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === open.char && close[1].length >= open.length) open = null;
      return { line, code: true };
    }
    const start = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (start && !(start[1][0] === "`" && start[2].includes("`"))) {
      open = { char: start[1][0], length: start[1].length, line: index + 1 };
      return { line, code: true };
    }
    return { line, code: false };
  });
  if (open) throw new Error(`${source}: code fence opened on line ${open.line} is never closed`);
  return marked;
}

// Splits README.md into its "## " sections. Only "## " lines outside code fences start a section;
// the title and badges above the first section are dropped by design.
export function splitReadme(markdown, source = "README.md") {
  const sections = [];
  let current = null;
  for (const { line, code } of markFences(markdown.split("\n"), source)) {
    const heading = code ? null : line.match(/^## (.+?)\s*$/);
    if (heading) {
      current = { heading: heading[1], lines: [line] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  const duplicate = findDuplicate(sections.map((section) => section.heading));
  if (duplicate) throw new Error(`${source}: heading "${duplicate}" appears more than once`);
  return sections.map((section) => ({
    heading: section.heading,
    raw: trimBlankLines(section.lines).join("\n"),
  }));
}

// Every README "## " heading must be mapped to a guide page or excluded, and every mapped
// heading must exist. Both kinds of error are reported together, naming the headings.
export function checkCoverage(sections, pages = guidePages, excluded = excludedSections) {
  const available = new Set(sections.map((section) => section.heading));
  const mapped = new Set();
  for (const page of pages) {
    for (const heading of page.sections) {
      if (mapped.has(heading)) throw new Error(`page-map: heading "${heading}" is mapped to more than one page`);
      mapped.add(heading);
    }
  }
  const unmapped = [...available].filter((heading) => !mapped.has(heading) && !Object.hasOwn(excluded, heading));
  const missing = [...mapped].filter((heading) => !available.has(heading));
  const problems = [];
  if (unmapped.length) {
    problems.push(
      `unmapped README "## " heading(s): ${unmapped.map((h) => `"${h}"`).join(", ")} — add each to a guide page in scripts/page-map.mjs or to excludedSections`,
    );
  }
  if (missing.length) {
    problems.push(`page-map heading(s) not found in README.md: ${missing.map((h) => `"${h}"`).join(", ")}`);
  }
  if (problems.length) throw new Error(problems.join("; "));
}

// Parses a leading "---" frontmatter block with simple `key: value` lines. Values may be
// double-quoted (JSON-style escapes), single-quoted or bare.
export function parseFrontmatter(text, source) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) throw new Error(`${source}: missing frontmatter (the file must start with a --- block)`);
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (pair) data[pair[1]] = unquote(pair[2].trim());
  }
  return { data, body: text.slice(match[0].length) };
}

// Anchor index for a set of pages. Maps each heading's GitHub-style slug to the link that
// reaches it. A slug that appears on two pages is an error, so an anchor link stays unambiguous.
export function buildGuideAnchors(pages) {
  const anchors = new Map();
  for (const page of pages) {
    const slugger = new GithubSlugger();
    for (const raw of page.sections) {
      for (const heading of headingsIn(raw)) {
        const slug = slugger.slug(heading);
        if (anchors.has(slug)) throw new Error(`anchor "${slug}" exists on two guide pages`);
        anchors.set(slug, `/${page.slug}/#${slug}`);
      }
    }
  }
  return anchors;
}

// Rewrites "](target)" links outside code fences and inline code:
//   - absolute URLs and mailto: links are left unchanged;
//   - "#anchor" links point to the page that now holds the heading;
//   - links to a sibling SKILL.md become the skill's page;
//   - any other relative path must exist in the repository and becomes a GitHub blob/tree link.
// A target that cannot be resolved throws, naming the source file and the link.
export function rewriteLinks(markdown, context) {
  return markFences(markdown.split("\n"), context.source)
    .map(({ line, code }) => (code ? line : rewriteLine(line, context)))
    .join("\n");
}

// Builds a guide page: frontmatter plus the mapped sections, in page-map order.
export function buildGuidePage(page, sections, context) {
  const byHeading = new Map(sections.map((section) => [section.heading, section]));
  const body = page.sections.map((heading) => byHeading.get(heading).raw).join("\n\n");
  return frontmatter({ title: page.title, description: page.description, slug: page.slug }) +
    `\n${rewriteLinks(body, context)}\n`;
}

// Builds a skill page from a SKILL.md. Its frontmatter name and description become the page title
// and description, and the skill's own H1 is dropped because the page title already shows it.
export function buildSkillPage({ folder, text, context }) {
  const source = context.source;
  const { data, body } = parseFrontmatter(text, source);
  for (const key of ["name", "description"]) {
    if (!data[key]) throw new Error(`${source}: frontmatter must define "${key}"`);
  }
  if (data.name !== folder) throw new Error(`${source}: frontmatter name "${data.name}" must match its folder "${folder}"`);
  const lines = trimBlankLines(body.split("\n"));
  if (lines[0] && /^# /.test(lines[0])) lines.shift();
  const content = rewriteLinks(trimBlankLines(lines).join("\n"), context);
  return frontmatter({
    title: data.name,
    description: data.description,
    slug: `skills/${folder}`,
    sidebarOrder: skillSidebarOrder(folder),
  }) + `\n${content}\n`;
}

// Generates every page into memory from the sources, validating everything first.
export function buildPages(repoRoot = defaultRepoRoot) {
  const readme = readSource(path.join(repoRoot, "README.md"), "README.md");
  const sections = splitReadme(readme, "README.md");
  checkCoverage(sections);

  const skillFolders = discoverSkillFolders(repoRoot);
  const skillSources = skillFolders.map((folder) => ({
    folder,
    source: `${folder}/SKILL.md`,
    text: readSource(path.join(repoRoot, folder, "SKILL.md"), `${folder}/SKILL.md`),
  }));
  const skills = new Set(skillFolders);

  const anchors = buildGuideAnchors(guidePages.map((page) => ({
    slug: page.slug,
    sections: page.sections.map((heading) => sections.find((section) => section.heading === heading).raw),
  })));
  const pages = new Map();
  for (const page of guidePages) {
    const pageSections = page.sections.map((heading) => sections.find((section) => section.heading === heading));
    pages.set(
      `${page.slug}.md`,
      buildGuidePage(page, pageSections, { source: "README.md", baseDir: "", repoRoot, skills, anchors }),
    );
  }
  for (const { folder, source, text } of skillSources) {
    const context = { source, baseDir: folder, repoRoot, skills, anchors: buildPageAnchors(text, folder) };
    pages.set(`skills/${folder}.md`, buildSkillPage({ folder, text, context }));
  }
  return pages;
}

// Builds every page, then replaces the output tree in one swap. If a write fails, the temporary
// tree is removed and the previous output is restored.
export function generateSite({
  repoRoot = defaultRepoRoot,
  outDir = defaultOutDir,
  tmpBase = defaultTmpBase,
} = {}) {
  const pages = buildPages(repoRoot);
  const stage = path.join(tmpBase, `${process.pid}-${Date.now()}`);
  const previous = `${stage}.previous`;
  let swapped = false;
  try {
    mkdirSync(stage, { recursive: true });
    for (const [relative, content] of pages) {
      const file = path.join(stage, relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    mkdirSync(path.dirname(outDir), { recursive: true });
    if (existsSync(outDir)) renameSync(outDir, previous);
    renameSync(stage, outDir);
    swapped = true;
  } catch (error) {
    if (!swapped && existsSync(previous) && !existsSync(outDir)) renameSync(previous, outDir);
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  rmSync(previous, { recursive: true, force: true });
  return [...pages.keys()];
}

function rewriteLine(line, context) {
  // Group 1 is an inline code span (left alone); groups 2 and 3 are a link target and title.
  return line.replace(/(`+)[\s\S]*?\1|\]\(([^()\s]+)((?:\s+"[^"]*")?)\)/g, (match, _tick, target, title) => {
    if (target === undefined) return match;
    return `](${rewriteTarget(target, context)}${title})`;
  });
}

function rewriteTarget(target, context) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return target;
  if (target.startsWith("#")) {
    const destination = context.anchors.get(target.slice(1));
    if (!destination) fail(context, target, "anchor does not match any heading on the site");
    return destination;
  }
  const [, pathPart, fragment = ""] = target.match(/^([^#]*)(#.*)?$/);
  const relative = path.posix.normalize(path.posix.join(context.baseDir, pathPart));
  if (relative === ".." || relative.startsWith("../")) fail(context, target, "points outside the repository");
  const skill = relative.match(/^([^/]+)\/SKILL\.md$/);
  if (skill && context.skills.has(skill[1])) return `/skills/${skill[1]}/${fragment}`;
  let stats;
  try {
    stats = statSync(path.join(context.repoRoot, relative));
  } catch {
    fail(context, target, "points to a repository path that does not exist");
  }
  const kind = stats.isDirectory() ? "tree" : "blob";
  const suffix = relative === "." ? "" : `/${relative}`;
  return `${REPO_URL}/${kind}/main${suffix}${fragment}`;
}

function buildPageAnchors(text, folder) {
  const { body } = parseFrontmatter(text, `${folder}/SKILL.md`);
  const slugger = new GithubSlugger();
  const anchors = new Map();
  for (const heading of headingsIn(body)) {
    const slug = slugger.slug(heading);
    anchors.set(slug, `#${slug}`);
  }
  return anchors;
}

function discoverSkillFolders(repoRoot) {
  return readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(repoRoot, name, "SKILL.md")))
    .sort();
}

// Headings "## " and "### " outside code fences, as plain text.
function headingsIn(markdown) {
  return markFences(markdown.split("\n"), "page")
    .filter(({ code }) => !code)
    .map(({ line }) => line.match(/^#{2,3} (.+?)\s*$/))
    .filter(Boolean)
    .map((match) => match[1]);
}

function readSource(file, label) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error.message}`);
  }
}

function frontmatter({ title, description, slug, sidebarOrder }) {
  const lines = ["---", `title: ${JSON.stringify(title)}`, `description: ${JSON.stringify(description)}`, `slug: ${slug}`];
  if (sidebarOrder !== undefined) lines.push("sidebar:", `  order: ${sidebarOrder}`);
  lines.push("---");
  return lines.join("\n");
}

function fail(context, target, reason) {
  throw new Error(`${context.source}: link "${target}" ${reason}`);
}

function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

function findDuplicate(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const written = generateSite();
    console.log(`import-sources: wrote ${written.length} pages to ${path.relative(docsDir, defaultOutDir)}`);
  } catch (error) {
    console.error(`import-sources: ${error.message}`);
    process.exitCode = 1;
  }
}
