import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pages = ["../index.html", "../app/index.html", "../player/index.html"];

describe("search indexing policy", () => {
  it.each(pages)("marks %s as noindex", (page) => {
    const html = readFileSync(new URL(page, import.meta.url), "utf8");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />');
  });
});
