import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manager-view entry point", () => {
  it("explains how to recover when the Vite source file is opened directly", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const rootContent = html.match(/<div id="root">([\s\S]*?)<\/div>/)?.[1] ?? "";

    expect(rootContent).toContain("Open the manager view from its web address");
    expect(rootContent).toContain("npm --prefix manager-web run preview:open");
  });
});
