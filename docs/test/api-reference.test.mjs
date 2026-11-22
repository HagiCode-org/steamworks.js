import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The API reference is rendered by starlight-typedoc from the JSDoc in client.d.ts, which napi-derive
// generates from the Rust doc comments. These tests keep the two ends honest: every exported function
// must carry a comment, and the built site must contain the rendered pages.
const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dts = readFileSync(path.join(docsDir, "..", "client.d.ts"), "utf8").split("\n");
const dist = path.join(docsDir, "dist");

// Every `export function` in a namespace, every class method, and every top-level function.
function undocumentedFunctions() {
  const missing = [];
  let namespace = null;
  let klass = null;
  dts.forEach((line, index) => {
    let match;
    if ((match = line.match(/^export declare namespace (\w+)/))) {
      namespace = match[1];
      klass = null;
      return;
    }
    if (/^}/.test(line)) {
      namespace = null;
      klass = null;
      return;
    }
    let name;
    if (!namespace) {
      name = line.match(/^export declare function (\w+)/)?.[1];
    } else if ((match = line.match(/^  export class (\w+)/))) {
      klass = match[1];
      return;
    } else if (/^  }/.test(line)) {
      klass = null;
      return;
    } else {
      name = line.match(/^  export function (\w+)/)?.[1] ?? line.match(/^    (\w+)\(/)?.[1];
    }
    if (!name) return;
    const previous = dts[index - 1] ?? "";
    if (!/\*\/\s*$/.test(previous)) missing.push(`${[namespace, klass, name].filter(Boolean).join(".")} (client.d.ts:${index + 1})`);
  });
  return missing;
}

describe("API reference source", () => {
  test("every exported function and method in client.d.ts has a JSDoc comment", () => {
    assert.deepEqual(undocumentedFunctions(), [], "add a /// doc comment in the Rust source, then rebuild to regenerate client.d.ts");
  });
});

describe("built API reference", () => {
  test("renders pages for the namespaces and links them from the sidebar", () => {
    assert.ok(existsSync(path.join(dist, "api", "index.html")), "dist/api/index.html is missing: run `pnpm run build` first");
    const sidebar = readFileSync(path.join(dist, "index.html"), "utf8").match(/<nav class="sidebar[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.match(sidebar, />API reference</);
    const namespaces = readdirSync(path.join(dist, "api", "client", "namespaces"), { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const name of ["workshop", "friends", "matchmaking", "overlay"]) {
      assert.ok(
        namespaces.some((e) => e.name === name.toLowerCase()),
        `no API reference page for the ${name} namespace`,
      );
    }
  });

  test("every generated function page is linked from the sidebar", () => {
    const sidebar = readFileSync(path.join(dist, "index.html"), "utf8").match(/<nav class="sidebar[\s\S]*?<\/nav>/)?.[0] ?? "";
    const linked = new Set([...sidebar.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
    const namespacesDir = path.join(dist, "api", "client", "namespaces");
    const pages = readdirSync(namespacesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(path.join(namespacesDir, e.name, "functions")))
      .flatMap((e) =>
        readdirSync(path.join(namespacesDir, e.name, "functions"), { withFileTypes: true })
          .filter((f) => f.isDirectory())
          .map((f) => `/api/client/namespaces/${e.name}/functions/${f.name}/`),
      );
    assert.ok(pages.length > 150, `expected the namespace function pages, found ${pages.length}`);
    assert.deepEqual(pages.filter((url) => !linked.has(url)), []);
  });

  test("a rendered function page carries its JSDoc text", () => {
    const page = path.join(dist, "api", "client", "namespaces", "workshop", "functions", "createitem", "index.html");
    assert.ok(existsSync(page), "workshop createItem page is missing");
    assert.match(readFileSync(page, "utf8"), /Creates an empty Workshop item/);
  });
});
