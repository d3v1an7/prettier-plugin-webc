# prettier-plugin-webc

Prettier formatting for [WebC](https://www.11ty.dev/docs/languages/webc/) files, including the JavaScript inside expression attributes, front matter and render templates.

The best thing about a `.webc` file is that it's pretty much HTML with extra :nail_care::sparkles:. This allows us to piggyback off Prettier's own HTML printer, adding "just enough" magic for the WebC parts to come out formatted too. Pairs well with [WebC Syntax](https://github.com/d3v1an7/vscode-webc-syntax) which handles syntax highlighting in VS Code.

## AI disclaimer

- :robot: Plugin code and tests were mostly written by Claude Code.
- :man: Plugin docs and code comments were written or edited by a human.

## Install

```sh
npm install --save-dev prettier prettier-plugin-webc
```

## Usage

Add the plugin to your [Prettier config](https://prettier.io/docs/configuration):

```json
{
  "plugins": ["prettier-plugin-webc"]
}
```

Or, for a zero config single run:

```sh
npx prettier --plugin prettier-plugin-webc --write "**/*.webc"
```

## Features

- [Front matter](#front-matter)
- [Expression attributes](#expression-attributes)
- [JavaScript templates](#javascript-templates)
- [Eleventy templates](#eleventy-templates)
- [Quotes](#quotes)
- [Options](#options)

## Front matter

The following (case-insensitive) front matter formats are identified and formatted by default:

- [YAML](https://www.11ty.dev/docs/data-frontmatter/) (`---`, `---yaml` or `---yml`) with Prettier's YAML printer
- [JavaScript](https://www.11ty.dev/docs/data-frontmatter/#java-script-front-matter) (`---js` or `---javascript`) with Prettier's JavaScript printer
- [JSON](https://www.11ty.dev/docs/data-frontmatter/#json-front-matter) (`---json`) with Prettier's JSON printer

Custom formats added via `setFrontMatterParsingOptions` (hello `TOML`) will be identified as generic front matter and not parsed.

## Expression attributes

| Attribute                                 | Value    | Formatted as                     |
| ----------------------------------------- | -------- | -------------------------------- |
| `:*` bindings (such as `:name`, `:@prop`) | required | JavaScript                       |
| `@attributes`                             | optional | JavaScript                       |
| `@html`                                   | required | JavaScript                       |
| `@raw`                                    | required | JavaScript                       |
| `@text`                                   | required | JavaScript                       |
| `webc:bucket`                             | required | string, kept as written          |
| `webc:else`                               | none     | —                                |
| `webc:elseif`                             | required | JavaScript                       |
| `webc:for`                                | required | JavaScript loop head (see below) |
| `webc:if`                                 | required | JavaScript                       |
| `webc:ignore`                             | none     | —                                |
| `webc:import`                             | required | string, kept as written          |
| `webc:is`                                 | required | string, kept as written          |
| `webc:keep`                               | none     | —                                |
| `webc:nokeep`                             | none     | —                                |
| `webc:raw`                                | none     | —                                |
| `webc:root`                               | optional | string, kept as written          |
| `webc:scoped`                             | optional | string, kept as written          |
| `webc:setup`                              | none     | —                                |
| `webc:type`                               | required | string, kept as written          |
| `11ty:type`                               | required | string, kept as written          |
| `@prop` (any other `@` attribute)         | required | string, kept as written          |

A `webc:for` value such as `item of items` or `(key, value) in obj` is a loop head rather than an expression: the binding on the left and the iterable on the right are each formatted, and the `of` / `in` keyword and any parentheses or destructuring stay as written. The iterable always starts on the same line as the keyword and only breaks inside itself (the way Prettier prints Vue's `v-for`), because WebC looks for a literal `" of "` / `" in "` and treats a loop head with a line break there as invalid.

**Examples of JavaScript formatting**

- Spacing, quoting and line breaking follow Prettier's JavaScript rules, the way Prettier prints Vue bindings.
- `{ color: theme.accent }` is understood as an object literal and gets wrapping parentheses, `({ color: theme.accent })`, because WebC evaluates the value as a script and a bare `{` would start a block. Existing parentheses are kept.
- `>` or `<` are understood as operators, not tag closures.
- A value that does not parse as a single JavaScript expression is printed exactly as written. The plugin never throws for an attribute value.

## JavaScript templates

`<template webc:type="js">` (and superseded `webc:type="render"`) content is formatted as JavaScript, the same as `<script webc:setup>`, including when the start tag has been split across several lines. Content that does not parse is kept as written.

## Eleventy templates

Markdown, Nunjucks or Liquid inside a `webc:type="11ty"` template is not HTML, so the whole element is copied through unchanged, attributes included.

## Quotes

An expression attribute is always wrapped in double quotes and string literals inside it switch to single quotes. A `"` that has to survive, inside a template literal for instance, is written as `&quot;`, and `&quot;` / `&apos;` in the source are decoded before the expression is parsed.

## Options

There are no plugin-specific options. All of Prettier's HTML options (`printWidth`, `htmlWhitespaceSensitivity`, `bracketSameLine`, `singleAttributePerLine`, ...) apply, because the output is produced by the HTML printer.

Plugins that wrap Prettier's `html` parser, such as [prettier-plugin-tailwindcss](https://github.com/tailwindlabs/prettier-plugin-tailwindcss), apply to `.webc` files too: the `webc` parser hands the markup to the `html` parser of the last loaded plugin that provides one, so `class` attributes are sorted whichever order the plugins are listed in.

`{your project}/.prettierrc`

```json
{
  "plugins": ["prettier-plugin-webc"],
  "singleAttributePerLine": true
}
```

## Limitations

- `webc:raw` and `webc:ignore` content is still formatted as HTML. Put `<!-- prettier-ignore -->` in front of an element to leave it alone.
- The `__js_expression` parser is an internal Prettier API. It has been stable across Prettier 3 (it is what Vue support is built on), but it is not part of the public contract.

## Local development and testing

```sh
npm ci
npm test
```

`npm test` runs `prettier --check` first, then the unit tests and the fixture snapshots in `test/fixtures`. Each `*.webc` fixture is formatted and compared to the `*.webc.out` beside it; a fixture with no `.out` file gets one written on the first run.

A snapshot test fails whenever the plugin's output changes, whether from a change to `src/`, a new Prettier version, or a new fixture. When the new output is what you want, rewrite the `.out` files:

```sh
UPDATE_SNAPSHOTS=1 npm test
npm run format
```

## Publish

1. Bump `version` in `package.json` and update `CHANGELOG.md`.
2. Run the tests with the command above.
3. Publish to npm:

   ```sh
   npm publish
   ```

4. Commit the version bump and changelog, tag it, and push:

   ```sh
   git commit -am "v$(node -p "require('./package.json').version")"
   git tag "v$(node -p "require('./package.json').version")"
   git push && git push --tags
   ```
