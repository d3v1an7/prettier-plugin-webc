import { doc } from "prettier";

const { hardline, markAsRoot } = doc.builders;

const FRONT_MATTER_MARK = Symbol.for("PRETTIER_IS_FRONT_MATTER");

/**
 * The front matter languages Eleventy parses out of the box, keyed by the
 * (lower-cased) marker that follows the opening `---`. Anything else, such as
 * `+++` TOML or a format registered through `setFrontMatterParsingOptions`, is
 * left to Prettier core, which prints it byte-for-byte.
 */
const LANGUAGES = new Map([
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["js", "js"],
  ["javascript", "js"],
  ["json", "json"],
]);

/**
 * Prettier core marks the front matter node it splits off the top of the file
 * and records the marker as written (`---JSON` gives `language: "JSON"`; a bare
 * `---` gives `yaml`). Eleventy matches the marker case-insensitively, so we do
 * too.
 */
export function frontMatterLanguage(node) {
  if (!node?.[FRONT_MATTER_MARK]) {
    return undefined;
  }
  return LANGUAGES.get(String(node.language).toLowerCase());
}

export function isFormattableFrontMatter(node) {
  return frontMatterLanguage(node) !== undefined;
}

async function toDoc(text, textToDoc, parser) {
  try {
    return await textToDoc(text, { parser });
  } catch {
    return undefined;
  }
}

/** YAML: the same as what Prettier core prints for `.html` files. */
const yamlToDoc = (text, textToDoc) => toDoc(text, textToDoc, "yaml");

/**
 * JavaScript: Eleventy decides the flavour by the first character. A block that
 * starts with `{` is the legacy object-literal form and is evaluated as `export
 * default {...}`; anything else is a script whose top-level declarations become
 * the data. The object form must be parsed as an expression: as a program `{
 * title: "x" }` is a block holding a labelled statement, which prints
 * differently and no longer evaluates as an object. A `;` after the closing
 * brace is dropped, as `export default {...};` would.
 */
async function jsToDoc(text, textToDoc) {
  if (text.startsWith("{")) {
    return toDoc(text.replace(/;$/, ""), textToDoc, "__js_expression");
  }
  return toDoc(text, textToDoc, "babel");
}

const jsonToDoc = (text, textToDoc) => toDoc(text, textToDoc, "json");

const FORMATTERS = { yaml: yamlToDoc, js: jsToDoc, json: jsonToDoc };

/**
 * The embed callback for a YAML, JavaScript or JSON front matter node. The
 * marker after `---` is kept exactly as written. Returning `undefined` hands
 * the node back to core, which prints it byte-for-byte.
 */
export async function printFrontMatter(textToDoc, print, path) {
  const { node } = path;
  const value = node.value.trim();
  if (value === "") {
    return undefined;
  }
  const body = await FORMATTERS[frontMatterLanguage(node)](value, textToDoc);
  if (body === undefined) {
    return undefined;
  }
  return markAsRoot([
    node.startDelimiter,
    node.explicitLanguage ?? "",
    hardline,
    body,
    hardline,
    node.endDelimiter,
  ]);
}
