import * as htmlPlugin from "prettier/plugins/html";

import { isWebcExpressionAttribute, printWebcAttribute } from "./attributes.js";
import { isFormattableFrontMatter, printFrontMatter } from "./front-matter.js";
import { formatJsTemplates, preserveForeignContent } from "./preserve.js";

const htmlParser = htmlPlugin.parsers.html;
const htmlPrinter = htmlPlugin.printers.html;

/**
 * Prettier's bundled HTML printer gates a couple of behaviours on
 * `options.parser === "html"`:
 *
 * - It only skips `{{ ... }}` interpolation extraction for plain HTML (WebC has
 *   no interpolation syntax, and 11ty templates routinely contain Nunjucks /
 *   Liquid `{{ }}` inside `<template webc:type="11ty">`);
 * - It only infers `<script type="module">` source type for plain HTML.
 *
 * Our parser is registered as `webc`, so hand the bundled printer an options
 * view that claims to be `html` for those decisions. Everything else in the
 * printer is either parser-agnostic or keyed on `vue` / `angular` / `lwc` /
 * `mjml`, which our name never matches, exactly like `html`.
 */
const htmlOptionsCache = new WeakMap();
function asHtmlOptions(options) {
  if (!options || typeof options !== "object" || options.parser === "html") {
    return options;
  }
  let htmlOptions = htmlOptionsCache.get(options);
  if (!htmlOptions) {
    htmlOptions = { ...options, parser: "html" };
    htmlOptionsCache.set(options, htmlOptions);
  }
  return htmlOptions;
}

export const languages = [
  {
    name: "WebC",
    parsers: ["webc"],
    extensions: [".webc"],
    vscodeLanguageIds: ["webc"],
    aliases: ["webc"],
  },
];

/**
 * Other plugins extend HTML formatting by wrapping the `html` parser. For
 * example, `prettier-plugin-tailwindcss` parses with the bundled parser and
 * then sorts every `class` value in the AST. Prettier resolves a parser name to
 * the last loaded plugin that provides it, so do the same for `html` and parse
 * through that plugin, falling back to the bundled parser. The AST is the HTML
 * AST either way, and everything downstream is unchanged.
 *
 * Prettier's own plugins expose a parser as a function that loads it on first
 * use, so that shape is accepted too.
 */
async function resolveHtmlParser(options) {
  const provider = options?.plugins?.findLast(
    (plugin) => plugin?.parsers?.html != null,
  );
  const parser = provider?.parsers.html;
  if (typeof parser === "function") {
    return parser();
  }
  return parser ?? htmlParser;
}

export const parsers = {
  webc: {
    ...htmlParser,
    astFormat: "webc",
    async parse(text, options) {
      const parser = await resolveHtmlParser(options);
      return parser.parse(text, options);
    },
  },
};

/**
 * Prettier core formats YAML front matter through the printer's `embed` feature
 * flag, but it only knows YAML. Opt out of core's version and print front
 * matter from our own `embed` instead, which also handles Eleventy's `---js`
 * and `---json` blocks. Anything it declines (TOML, custom formats, blocks that
 * do not parse) still goes through core's `print` path, byte-for-byte.
 */
const features = {
  ...htmlPrinter.features,
  experimental_frontMatterSupport: {
    ...htmlPrinter.features?.experimental_frontMatterSupport,
    embed: false,
  },
};

export const printers = {
  webc: {
    ...htmlPrinter,
    features,

    preprocess(ast, options) {
      formatJsTemplates(ast, options.originalText);
      const processed = htmlPrinter.preprocess(ast, asHtmlOptions(options));
      return preserveForeignContent(processed);
    },

    embed(path, options) {
      const { node } = path;
      if (node?.kind === "attribute" && isWebcExpressionAttribute(node)) {
        return printWebcAttribute;
      }
      if (isFormattableFrontMatter(node)) {
        return printFrontMatter;
      }

      const result = htmlPrinter.embed(path, asHtmlOptions(options));
      if (typeof result !== "function") {
        return result;
      }
      return (textToDoc, print, path, options) =>
        result(textToDoc, print, path, asHtmlOptions(options));
    },
  },
};

export const options = htmlPlugin.options;

export default { languages, parsers, printers, options };
