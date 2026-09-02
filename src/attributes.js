import { doc } from "prettier";

const { group, indent, softline } = doc.builders;
const { mapDoc } = doc.utils;
const { printDocToString } = doc.printer;

/**
 * Attributes whose value WebC evaluates as JavaScript:
 *
 * - `:name="expr"` dynamic attributes and `:@prop="expr"` dynamic props
 * - The content helpers `@html`, `@text`, `@raw`, `@attributes`
 * - The `webc:if` / `webc:elseif` directives
 *
 * Any other `@prop="..."` is a _static_ prop whose value is a plain string, so
 * it is deliberately left alone. `webc:for` is a loop head rather than an
 * expression and is handled separately.
 */
const EXPRESSION_HELPERS = new Set([
  "@html",
  "@text",
  "@raw",
  "@attributes",
  "webc:if",
  "webc:elseif",
]);
const FOR_DIRECTIVE = "webc:for";

export function isWebcExpressionAttribute(node) {
  const name = node.fullName ?? node.name ?? "";
  if (typeof node.value !== "string" || node.value.trim() === "") {
    return false;
  }
  if (EXPRESSION_HELPERS.has(name) || name === FOR_DIRECTIVE) {
    return true;
  }
  return name.length > 1 && name.startsWith(":");
}

/**
 * The HTML parser keeps attribute values raw, so `&quot;` / `&apos;` survive as
 * text. Mirror Prettier's own `getUnescapedAttributeValue` before handing the
 * text to the JS parser, and re-escape `"` on the way out (string literals come
 * back single-quoted, so this only affects template literals, regexes and the
 * like).
 */
function unescapeAttributeValue(value) {
  return value.replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}

function escapeDoubleQuotes(valueDoc) {
  return mapDoc(valueDoc, (part) =>
    typeof part === "string" ? part.replaceAll('"', "&quot;") : part,
  );
}

/**
 * Mirrors Prettier's `shouldHugJsExpression` for Vue bindings: object and array
 * literals sit directly inside the quotes, and so does a lone template literal
 * or string, which cannot be shortened by breaking. Everything else may break
 * onto its own indented line.
 */
const HUGGED_EXPRESSIONS = new Set([
  "ObjectExpression",
  "ArrayExpression",
  "TemplateLiteral",
  "StringLiteral",
]);

function shouldHugJsExpression(ast) {
  const rootNode = ast?.type === "JsExpressionRoot" ? ast.node : ast;
  return HUGGED_EXPRESSIONS.has(rootNode?.type);
}

function docStartsWith(valueDoc, options, prefix) {
  const { formatted } = printDocToString(valueDoc, options);
  return formatted.trimStart().startsWith(prefix);
}

/**
 * Format a JavaScript expression for use inside an HTML attribute. Returns
 * `undefined` if the text cannot be parsed as a single expression. `hugAlways`
 * keeps the expression on the opening line instead of letting it move to its
 * own indented line.
 */
async function formatExpression(
  text,
  textToDoc,
  options,
  { hugAlways = false } = {},
) {
  if (text.trim() === "") {
    return undefined;
  }
  let hug = true;
  let formatted;
  try {
    formatted = await textToDoc(text, {
      parser: "__js_expression",
      __isInHtmlAttribute: true,
      __embeddedInHtml: true,
      __onHtmlBindingRoot(ast) {
        hug = shouldHugJsExpression(ast);
      },
    });
  } catch {
    return undefined;
  }
  if (docStartsWith(formatted, options, "{")) {
    formatted = ["(", formatted, ")"];
  }
  return hug || hugAlways
    ? formatted
    : group([indent([softline, formatted]), softline]);
}

/**
 * `webc:for="item of items"`, `webc:for="(item, index) of items"`,
 * `webc:for="(key, value) in obj"`. The right-hand side is a JS expression; the
 * left-hand side is formatted only when it survives as a one-line expression
 * (identifier, parenthesised list, destructuring pattern) and is otherwise kept
 * verbatim.
 *
 * WebC finds the keyword with a literal `" of "` / `" in "` search, so the
 * iterable always starts on the same line as the keyword (as Prettier prints
 * Vue's `v-for`) and only breaks inside itself.
 */
const FOR_HEAD_RE = /^\s*(.*?)\s+(of|in)\s+(.*?)\s*$/s;

async function formatForLeft(left, textToDoc, options) {
  try {
    const leftDoc = await textToDoc(left, {
      parser: "__js_expression",
      __isInHtmlAttribute: true,
      __embeddedInHtml: true,
    });
    const { formatted } = printDocToString(leftDoc, {
      ...options,
      printWidth: Number.POSITIVE_INFINITY,
    });
    if (formatted.includes("\n")) {
      return left;
    }
    return left.startsWith("(") && !formatted.startsWith("(")
      ? `(${formatted})`
      : formatted;
  } catch {
    return left;
  }
}

async function formatForHead(text, textToDoc, options) {
  const match = FOR_HEAD_RE.exec(text);
  if (!match) {
    return undefined;
  }
  const [, left, operator, right] = match;
  const rightDoc = await formatExpression(right, textToDoc, options, {
    hugAlways: true,
  });
  if (rightDoc === undefined) {
    return undefined;
  }
  const leftText = await formatForLeft(left, textToDoc, options);
  return [leftText, " ", operator, " ", rightDoc];
}

/**
 * The embed callback for a WebC expression attribute. Any failure yields
 * `undefined`, which tells Prettier to print the attribute exactly as written.
 */
export async function printWebcAttribute(textToDoc, print, path, options) {
  const { node } = path;
  const name = node.fullName ?? node.name;
  const value = unescapeAttributeValue(node.value);

  const valueDoc =
    name === FOR_DIRECTIVE
      ? await formatForHead(value, textToDoc, options)
      : await formatExpression(value, textToDoc, options);

  if (valueDoc === undefined) {
    return undefined;
  }
  return [node.rawName ?? name, '="', group(escapeDoubleQuotes(valueDoc)), '"'];
}
