import assert from "node:assert/strict";
import { test } from "node:test";

import * as prettier from "prettier";
import * as htmlPlugin from "prettier/plugins/html";

import plugin from "../src/index.js";
import { format, formatHtml } from "./helpers.js";

test("formats the JavaScript inside @html", async () => {
  assert.equal(
    await format(`<p @html="test({id: foo,bar:bar})"></p>\n`),
    `<p @html="test({ id: foo, bar: bar })"></p>\n`,
  );
});

test("formats :href and :class bindings", async () => {
  assert.equal(
    await format(`<a :href="url( 'x' )" :class="cls?'a':'b'">x</a>\n`),
    `<a :href="url('x')" :class="cls ? 'a' : 'b'">x</a>\n`,
  );
});

test("formats :@prop dynamic props", async () => {
  assert.equal(
    await format(`<my-widget :@count="count+1"></my-widget>\n`),
    `<my-widget :@count="count + 1"></my-widget>\n`,
  );
});

test("formats @text, @raw and @attributes", async () => {
  assert.equal(
    await format(
      `<p @text="a+b"></p>\n<p @raw="x[ 0 ]"></p>\n<img @attributes="({src:image,alt:title})" />\n`,
    ),
    `<p @text="a + b"></p>\n<p @raw="x[0]"></p>\n<img @attributes="({ src: image, alt: title })" />\n`,
  );
});

test("keeps an object literal parenthesised so WebC does not parse a block", async () => {
  assert.equal(
    await format(`<div @attributes="{a:1,b:2}"></div>\n`),
    `<div @attributes="({ a: 1, b: 2 })"></div>\n`,
  );
});

test("hugs a long template literal or string to the quotes instead of wrapping it", async () => {
  const source = [
    `<input`,
    `  :readonly="\`\${Boolean(is_locked_when_signed_in)} && $store.authentication.state.isAuthenticated\`"`,
    `  :placeholder="'a string literal that is far too long to fit on one line at the default width'"`,
    `/>`,
    ``,
  ].join("\n");
  assert.equal(await format(source), source);
});

test("formats webc:if and webc:elseif expressions", async () => {
  assert.equal(
    await format(
      `<div webc:if="a&&b"></div>\n<div webc:elseif="c||  d"></div>\n`,
    ),
    `<div webc:if="a && b"></div>\n<div webc:elseif="c || d"></div>\n`,
  );
});

test("leaves the boolean webc:else alone", async () => {
  assert.equal(
    await format(`<div webc:else></div>\n`),
    `<div webc:else></div>\n`,
  );
});

test("formats a webc:for head without corrupting it", async () => {
  assert.equal(
    await format(
      [
        `<ul webc:for="item of items.filter(i=>i.ok)">`,
        `<li webc:for="(key,value) in obj"></li>`,
        `<li webc:for="( item , index ) of list"></li>`,
        `<li webc:for="{a,b} of xs"></li>`,
        `</ul>`,
        ``,
      ].join("\n"),
    ),
    [
      `<ul webc:for="item of items.filter((i) => i.ok)">`,
      `  <li webc:for="(key, value) in obj"></li>`,
      `  <li webc:for="(item, index) of list"></li>`,
      `  <li webc:for="{ a, b } of xs"></li>`,
      `</ul>`,
      ``,
    ].join("\n"),
  );
});

test("keeps the webc:for iterable on the keyword's line when it breaks", async () => {
  // WebC locates the keyword with a literal " of " / " in " search, so a line
  // break straight after it makes the loop head unparsable.
  assert.equal(
    await format(
      `<li webc:for="(story_data, story_index) of group_props.group.related_stories.items.filter((story) => story.published).slice(0, 3)"></li>\n`,
    ),
    [
      `<li`,
      `  webc:for="(story_data, story_index) of group_props.group.related_stories.items`,
      `    .filter((story) => story.published)`,
      `    .slice(0, 3)"`,
      `></li>`,
      ``,
    ].join("\n"),
  );
});

test("leaves a webc:for head it cannot parse unchanged", async () => {
  assert.equal(
    await format(`<li webc:for="x in"></li>\n<li webc:for="items"></li>\n`),
    `<li webc:for="x in"></li>\n<li webc:for="items"></li>\n`,
  );
});

test("leaves an unparsable expression unchanged", async () => {
  assert.equal(
    await format(`<p @text="this is not js"></p>\n<p :x="a +"></p>\n`),
    `<p @text="this is not js"></p>\n<p :x="a +"></p>\n`,
  );
});

test("leaves static @props alone (they are strings, not expressions)", async () => {
  assert.equal(
    await format(
      `<svg-icon @name="external-link" @label="Hello World"></svg-icon>\n`,
    ),
    `<svg-icon @name="external-link" @label="Hello World"></svg-icon>\n`,
  );
});

test("switches to single quotes when the expression contains double quotes", async () => {
  assert.equal(
    await format(`<p @text='say("hi")'></p>\n`),
    `<p @text="say('hi')"></p>\n`,
  );
  assert.equal(
    await format(`<p @raw="\`a\${b}\` + &quot;c&quot;"></p>\n`),
    `<p @raw="\`a\${b}\` + 'c'"></p>\n`,
  );
});

test("escapes double quotes that have to stay in the expression", async () => {
  assert.equal(
    await format(`<p @text='\`quoted "inside" template\`'></p>\n`),
    `<p @text="\`quoted &quot;inside&quot; template\`"></p>\n`,
  );
});

test("formats YAML front matter like Prettier does for .html", async () => {
  const source = `---\ntitle: job\nlayout:   custom\ntags: \n  - a\n---\n\n<h1 @text="title"></h1>\n`;
  assert.equal(await format(source), await formatHtml(source));
  assert.equal(
    await format(source),
    `---\ntitle: job\nlayout: custom\ntags:\n  - a\n---\n\n<h1 @text="title"></h1>\n`,
  );
});

test("leaves YAML front matter that does not parse byte-for-byte", async () => {
  for (const block of [
    `title: [unclosed`,
    `title:   "My page title";`,
    `tags:\n  - posts\n- featured`,
  ]) {
    const source = `---\n${block}\n---\n\n<p></p>\n`;
    assert.equal(await format(source), source);
  }
});

test("formats object-literal JS front matter as an expression", async () => {
  assert.equal(
    await format(
      `---js\n{\n  pagination: { data: 'all.authors',   alias: 'item' }\n}\n---\n\n<h1 @text="item.author"></h1>\n`,
    ),
    `---js\n{\n  pagination: { data: "all.authors", alias: "item" },\n}\n---\n\n<h1 @text="item.author"></h1>\n`,
  );
  // Not a block with a labelled statement: no `;` sneaks in after the value.
  assert.equal(
    await format(`---js\n{ title: 'x' }\n---\n<p></p>\n`),
    `---js\n{ title: "x" }\n---\n\n<p></p>\n`,
  );
  // A trailing `;` after the object is dropped.
  assert.equal(
    await format(`---js\n{ title: 'x' };\n---\n<p></p>\n`),
    `---js\n{ title: "x" }\n---\n\n<p></p>\n`,
  );
});

test("formats declaration-style JS front matter as a script", async () => {
  assert.equal(
    await format(
      `---js\nconst title = "My page title";\n\n function currentDate() {\n      return (new Date()).toLocaleString();\n}\n---\n\n<h1 @text="title"></h1>\n`,
    ),
    `---js\nconst title = "My page title";\n\nfunction currentDate() {\n  return new Date().toLocaleString();\n}\n---\n\n<h1 @text="title"></h1>\n`,
  );
});

test("formats JSON front matter", async () => {
  assert.equal(
    await format(
      `---json\n{\n  "title": "Render function",   "count": 3\n}\n---\n\n<p @text="title"></p>\n`,
    ),
    `---json\n{\n  "title": "Render function",\n  "count": 3\n}\n---\n\n<p @text="title"></p>\n`,
  );
});

test("matches the front matter language case-insensitively, keeping the marker", async () => {
  for (const [marker, source, expected] of [
    ["yml", `title:   'x'`, `title: "x"`],
    ["YAML", `title:   'x'`, `title: "x"`],
    ["javascript", `const a = 'x'`, `const a = "x";`],
    ["JS", `{ a: 'x' }`, `{ a: "x" }`],
    ["Json", `{"a":"x"}`, `{ "a": "x" }`],
  ]) {
    assert.equal(
      await format(`---${marker}\n${source}\n---\n<p></p>\n`),
      `---${marker}\n${expected}\n---\n\n<p></p>\n`,
    );
  }
});

test("leaves JS and JSON front matter it cannot parse byte-for-byte", async () => {
  for (const source of [
    `---js\n{ title: 'x'\n---\n\n<p></p>\n`,
    `---js\nconst = 1;\n---\n\n<p></p>\n`,
    `---js\n{ title: 'x' }\nconst b = 2;\n---\n\n<p></p>\n`,
    `---json\n{ "title": }\n---\n\n<p></p>\n`,
  ]) {
    assert.equal(await format(source), source);
  }
});

test("leaves TOML and custom front matter formats byte-for-byte", async () => {
  for (const source of [
    `+++\ntitle =   "x"\n+++\n\n<p></p>\n`,
    `---toml\ntitle =   "x"\n---\n\n<p></p>\n`,
    `---custom\nwhatever   goes\n---\n\n<p></p>\n`,
  ]) {
    assert.equal(await format(source), source);
  }
});

test("still formats <script webc:setup> as JavaScript", async () => {
  assert.equal(
    await format(
      `<script webc:setup>\nexport const x = (a)=>{return a+1}\n</script>\n`,
    ),
    `<script webc:setup>\n  export const x = (a) => {\n    return a + 1;\n  };\n</script>\n`,
  );
});

test("still formats <style webc:scoped> as CSS", async () => {
  assert.equal(
    await format(`<style webc:scoped>\n:host{display:block}\n</style>\n`),
    `<style webc:scoped>\n  :host {\n    display: block;\n  }\n</style>\n`,
  );
});

test("leaves plain attributes untouched and treats class like Prettier's HTML printer", async () => {
  const source = `<p class="a  b" data-x="a  b" title="{a:1}"></p>\n`;
  assert.equal(await format(source), await formatHtml(source));
  assert.match(await format(source), /data-x="a  b" title="\{a:1\}"/);
});

test("does not treat {{ }} in text as interpolation", async () => {
  // Plain text: whitespace collapses as usual, but `a+b` is not reformatted
  // and non-JS content does not throw.
  const source = `<p>{{ a+b }} and {{ not js at all }}</p>\n`;
  assert.equal(await format(source), source);
});

test("preserves 11ty template content verbatim", async () => {
  const body = `\n# Heading\n\nPara with **bold** and {{ title }}.\n\n- list\n`;
  const source = `<template webc:type="11ty" 11ty:type="md">${body}</template>\n`;
  assert.equal(await format(source), source);
  const inline = `<span>a</span><template webc:type="11ty" 11ty:type="md">${body}</template><span>b</span>\n`;
  assert.equal(await format(inline), inline);
});

test('formats <template webc:type="js"> content as JavaScript', async () => {
  assert.equal(
    await format(
      `<template webc:type="js">\nposts.length>3 ? \`<a href="/authors/\${slug}/">All \${posts.length} posts</a>\` : ""\n</template>\n`,
    ),
    [
      `<template webc:type="js">`,
      `  posts.length > 3`,
      `    ? \`<a href="/authors/\${slug}/">All \${posts.length} posts</a>\``,
      `    : "";`,
      `</template>`,
      ``,
    ].join("\n"),
  );
});

test('formats webc:type="render" content, including a top-level return', async () => {
  assert.equal(
    await format(
      `<template webc:type="render" webc:raw>return \`<p>\${count>2?"many":"few"}</p>\`</template>\n`,
    ),
    [
      `<template webc:type="render" webc:raw>`,
      `  return \`<p>\${count > 2 ? "many" : "few"}</p>\`;`,
      `</template>`,
      ``,
    ].join("\n"),
  );
});

test("joins a JS template start tag that was split across lines", async () => {
  assert.equal(
    await format(
      `<template\n  webc:type="js"\n  webc:nokeep\n>\n  export default \`<b>\${count}</b>\`;\n</template>\n`,
    ),
    `<template webc:type="js" webc:nokeep>\n  export default \`<b>\${count}</b>\`;\n</template>\n`,
  );
});

test("leaves a JS template it cannot parse as written", async () => {
  const source = `<template webc:type="js">\n  this is not js (\n</template>\n`;
  assert.equal(await format(source), source);
});

test("leaves an empty expression attribute alone", async () => {
  const source = `<p @text=""></p>\n<div webc:if=""></div>\n`;
  assert.equal(await format(source), source);
});

test("joins an expression that was split across lines", async () => {
  assert.equal(
    await format(`<p\n  webc:if="a &&\n    b">m</p>\n`),
    `<p webc:if="a && b">m</p>\n`,
  );
});

test("formats a dynamic :webc:bucket and still formats the script", async () => {
  assert.equal(
    await format(`<script :webc:bucket="name  ">\nconst a=1\n</script>\n`),
    `<script :webc:bucket="name">\n  const a = 1;\n</script>\n`,
  );
});

/**
 * Stands in for prettier-plugin-tailwindcss: wraps the bundled `html` parser
 * and rewrites every `class` value after parsing.
 */
const sortsClasses = {
  parsers: {
    html: {
      ...htmlPlugin.parsers.html,
      async parse(text, options) {
        const ast = await htmlPlugin.parsers.html.parse(text, options);
        ast.walk((node) => {
          if (node.kind === "attribute" && node.fullName === "class") {
            node.value = node.value.split(/\s+/).sort().join(" ");
          }
        });
        return ast;
      },
    },
  },
};

test("parses through another plugin's html parser, whichever order the plugins load in", async () => {
  const source = `<p class="p-4 flex" @text="a+b">x</p>\n`;
  const expected = `<p class="flex p-4" @text="a + b">x</p>\n`;
  assert.equal(
    await format(source, { plugins: [plugin, sortsClasses] }),
    expected,
  );
  assert.equal(
    await format(source, { plugins: [sortsClasses, plugin] }),
    expected,
  );
  assert.equal(
    await format(source),
    `<p class="p-4 flex" @text="a + b">x</p>\n`,
  );
});

test("registers .webc so the parser is inferred from the file path", async () => {
  assert.equal(
    await prettier.format(`<p @html="test({id: foo,bar:bar})"></p>`, {
      filepath: "page.webc",
      plugins: [plugin],
    }),
    `<p @html="test({ id: foo, bar: bar })"></p>\n`,
  );
});
