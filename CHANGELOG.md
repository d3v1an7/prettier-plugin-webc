# Changelog

## 0.1.0

- First release.
- `.webc` files are parsed and printed with Prettier's own HTML support.
- `:name` and `:@prop` bindings, `@text`, `@html`, `@raw`, `@attributes`, `webc:if` and `webc:elseif` values are formatted as JavaScript expressions.
- Both sides of a `webc:for` loop head are formatted; anything that does not parse is left as written. The iterable always starts on the same line as the `of` / `in` keyword.
- Front matter is formatted as YAML (`---`, `---yaml`, `---yml`), JavaScript (`---js`, `---javascript`) or JSON (`---json`), matched case-insensitively; `---toml` and other custom fences are left as written.
- `<template webc:type="js">` and `webc:type="render"` content is formatted as JavaScript, including when the start tag is split across lines.
- `webc:type="11ty"` elements are kept verbatim.
- Plugins that wrap the `html` parser (such as `prettier-plugin-tailwindcss`), run first so their changes show up in `.webc` output too.
