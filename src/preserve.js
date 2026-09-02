/**
 * `webc:type` decides what an element's content is. Two cases need help from
 * the plugin because the HTML parser has already read the content as HTML:
 *
 * - `webc:type="11ty"`: the content is another Eleventy template language
 *   (Markdown, Nunjucks, Liquid, ...). Reflowing Markdown as HTML text changes
 *   its meaning, so the whole element is printed verbatim.
 * - `webc:type="js"` / `webc:type="render"` on a `<template>`: the content is
 *   JavaScript. It is formatted the way `<script webc:setup>` is, by handing
 *   the element to the HTML printer's own `<script>` path.
 *
 * `<script>` / `<style>` keep Prettier's normal embedded formatting.
 */
const FOREIGN_CONTENT_TYPES = new Set(["11ty"]);
const JS_TEMPLATE_TYPES = new Set(["js", "render"]);
const SCRIPT_LIKE = new Set(["script", "style"]);

function webcType(node) {
  const typeAttr = node.attrs?.find((attr) => attr.fullName === "webc:type");
  return typeAttr?.value?.trim();
}

function hasForeignContent(node) {
  if (node.kind !== "element" || SCRIPT_LIKE.has(node.name)) {
    return false;
  }
  // Only an element with an explicit closing tag has a source span that covers
  // its whole content.
  if (!node.endSourceSpan) {
    return false;
  }
  return FOREIGN_CONTENT_TYPES.has(webcType(node));
}

function isJsTemplate(node) {
  return (
    node.kind === "element" &&
    node.name === "template" &&
    node.endSourceSpan != null &&
    JS_TEMPLATE_TYPES.has(webcType(node))
  );
}

/**
 * Run before the bundled HTML preprocess, this makes every `<template
 * webc:type="js">` look like a `<script>` to the HTML printer:
 *
 * - `name` becomes `script`, so the printer's script detection picks it up, gives
 *   it block display and formats its text child with the JavaScript parser;
 * - `rawName`, which the printer uses for the opening and closing tag, is pinned
 *   back to `template` (it is a prototype getter, so an own property shadows
 *   it);
 * - The children the HTML parser produced are replaced by a single text node
 *   holding the raw source between the tags.
 *
 * Retagging the node beats printing it by hand: the opening tag layout,
 * `bracketSameLine`, `singleAttributePerLine` and closing-marker borrowing all
 * live in the printer's element path and are reused as they are. When the
 * JavaScript does not parse, the printer's embed fails and the text is printed
 * as written.
 */
export function formatJsTemplates(ast, originalText) {
  const nodes = [];
  ast.walk((node) => {
    if (isJsTemplate(node)) {
      nodes.push(node);
    }
  });
  for (const node of nodes) {
    const start = node.startSourceSpan.end;
    const end = node.endSourceSpan.start;
    const SourceSpan = node.sourceSpan.constructor;
    node.name = "script";
    Object.defineProperty(node, "rawName", {
      value: "template",
      configurable: true,
    });
    node.$children = [];
    node.insertChildBefore(undefined, {
      kind: "text",
      value: originalText.slice(start.offset, end.offset),
      sourceSpan: new SourceSpan(start, end),
    });
  }
  return ast;
}

/**
 * Run after the bundled HTML preprocess (so every whitespace-sensitivity flag
 * has been computed for the node as the element it really is), this turns each
 * foreign-content element into a leaf that the HTML printer prints as a
 * verbatim slice of the original source. The printer's `comment` branch is
 * exactly that: `originalText.slice(start, end)` wrapped in its own tag-marker
 * borrowing logic, so surrounding output stays well formed.
 */
export function preserveForeignContent(ast) {
  const nodes = [];
  ast.walk((node) => {
    if (hasForeignContent(node)) {
      nodes.push(node);
    }
  });
  for (const node of nodes) {
    node.kind = "comment";
    // `isPrettierIgnore` and the `<!-- display: ... -->` hint read `value`.
    node.value = "";
    // A leaf: `getLastDescendant` must resolve to the node itself so the
    // parent never tries to borrow a closing marker we print ourselves.
    node.$children = [];
  }
  return ast;
}
