import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";

import { format } from "./helpers.js";

const dir = new URL("./fixtures/", import.meta.url);
const fixtures = readdirSync(dir)
  .filter((name) => name.endsWith(".webc"))
  .sort();

for (const name of fixtures) {
  test(`fixture ${name} matches ${name}.out and is idempotent`, async () => {
    const source = readFileSync(new URL(name, dir), "utf8");
    const output = await format(source, { filepath: name });
    const expectedUrl = new URL(`${name}.out`, dir);
    if (process.env.UPDATE_SNAPSHOTS || !existsSync(expectedUrl)) {
      writeFileSync(expectedUrl, output);
    }
    assert.equal(output, readFileSync(expectedUrl, "utf8"));
  });
}
