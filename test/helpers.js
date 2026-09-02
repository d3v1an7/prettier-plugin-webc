import assert from "node:assert/strict";

import * as prettier from "prettier";

import plugin from "../src/index.js";

/**
 * Format `source` with the plugin and assert the result is stable under a
 * second pass.
 */
export async function format(source, options = {}) {
  const resolved = { parser: "webc", plugins: [plugin], ...options };
  const once = await prettier.format(source, resolved);
  const twice = await prettier.format(once, resolved);
  assert.equal(twice, once, "formatting must be idempotent");
  return once;
}

export const formatHtml = (source) =>
  prettier.format(source, { parser: "html" });
