/*
 * Start Vite with npm run dev, then run npm run test:markdown.
 * Install the test browser once with npx playwright install chromium, or set
 * PLAYWRIGHT_CHANNEL=chrome to use an installed Chrome browser.
 * MARKDOWN_TEST_URL selects another dev/preview server. Browser data is isolated.
 */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const base = process.env.MARKDOWN_TEST_URL || "http://127.0.0.1:3000";
const output = path.join(os.tmpdir(), "oraen-markdown-qa");
const file = (name, content) => ({
  name,
  mimeType: "text/markdown",
  buffer: Buffer.from(content),
});
const paragraph =
  "阅读体验来自清晰的层级、舒适的排版和可靠的导航。This is a reader quality check.\n\n";
const content =
  "# 阅读工作台\n\n[跳转到结语](#结语)\n\n" +
  "## 开始阅读\n\n" +
  paragraph.repeat(6) +
  "### **中文**与 `代码`\n\n| 功能 | 状态 |\n| --- | --- |\n| 目录 | 就绪 |\n\n- [x] 已完成\n\n> 清晰的阅读体验\n\n" +
  '```javascript\n// # 不是标题\nconst message = "hello";\nconsole.log(message);\n```\n\n' +
  "## 重复标题\n\n" +
  paragraph.repeat(7) +
  "## 重复标题\n\n" +
  paragraph.repeat(7) +
  "## 重复标题-1\n\n" +
  paragraph.repeat(4) +
  "Setext heading\n--------------\n\n" +
  paragraph.repeat(5) +
  "## 结语\n\n文档结语。\n\n![本地示意图](./missing.png)\n\n<script>window.__mdUnsafe = true</script>\n";

async function until(check, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${label}`);
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      permissions: ["clipboard-read", "clipboard-write"],
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.error("Browser error:", error.message);
    });
    await page.goto(`${base}/#/professionalUtil/markdownUtil`);
    await page.locator(".md-welcome").waitFor();
    await page
      .locator("input[type=file]")
      .setInputFiles([file("reading.md", content)]);
    await page.locator("#md-heading-阅读工作台").waitFor();
    await page.locator(".md-panels.has-outline").waitFor();
    assert.equal(
      await page.locator(".md-sidebar .md-outline").count(),
      0,
      "File library and document outline have separate places",
    );
    assert.equal(
      await page.locator(".md-sidebar .md-file").count(),
      1,
      "Imported documents remain visible while reading",
    );
    const readingBounds = await page
      .locator(".md-reading-scroll")
      .boundingBox();
    const outlineBounds = await page
      .locator(".md-document-outline")
      .boundingBox();
    assert(
      outlineBounds.x >= readingBounds.x + readingBounds.width - 1,
      "Outline belongs on the right of the reading area",
    );
    await page
      .getByRole("button", { name: "收起文档目录", exact: true })
      .click();
    await page.locator(".md-document-outline").waitFor({ state: "hidden" });
    assert(
      (await page.locator(".md-reading-scroll").boundingBox()).width >
        readingBounds.width,
      "Hiding the outline gives its space back to the document",
    );
    await page.getByRole("button", { name: "文档目录", exact: true }).click();
    await page.locator(".md-document-outline").waitFor({ state: "visible" });
    assert.equal(
      await page.locator(".md-outline-link").count(),
      8,
      "AST outline must ignore code fences",
    );
    const ids = await page
      .locator(".md-article :is(h1,h2,h3)")
      .evaluateAll((nodes) => nodes.map((node) => node.id));
    assert.equal(
      new Set(ids).size,
      ids.length,
      "Repeated titles need unique anchors, including suffix collisions",
    );
    assert(ids.includes("md-heading-中文与-代码"));
    assert.equal(await page.locator(".md-article table").count(), 1);
    assert.equal(
      await page.locator(".md-code-block .token.keyword").count(),
      1,
    );
    assert.equal(
      await page.evaluate(() => window.__mdUnsafe),
      undefined,
      "Raw HTML must not execute",
    );
    assert.equal(await page.locator(".md-image-fallback").count(), 1);
    await page.screenshot({
      path: path.join(output, "reading.png"),
      fullPage: true,
    });

    // Navigation is scoped to the reading scroller, not the application hash router.
    const route = page.url();
    await page.getByRole("button", { name: "结语", exact: true }).click();
    await until(
      () =>
        page
          .locator(".md-reading-scroll")
          .evaluate((node) => node.scrollTop > 500),
      "outline jump",
    );
    assert.equal(page.url(), route);
    assert.equal(
      await page
        .locator(".md-outline-link[aria-current=location]")
        .textContent(),
      "结语",
    );
    await page.getByRole("button", { name: "回到顶部", exact: true }).click();
    await until(
      () =>
        page
          .locator(".md-reading-scroll")
          .evaluate((node) => node.scrollTop === 0),
      "back to top",
    );
    await page.getByRole("link", { name: "跳转到结语", exact: true }).click();
    await until(
      () =>
        page
          .locator(".md-reading-scroll")
          .evaluate((node) => node.scrollTop > 500),
      "document anchor",
    );
    assert.equal(page.url(), route);
    await page.locator(".md-reading-scroll").evaluate((node) => {
      node.scrollTop = 500;
    });
    await until(
      async () =>
        (await page
          .locator(".md-outline-link[aria-current=location]")
          .textContent()) !== "结语",
      "scroll spy",
    );
    await page.getByRole("button", { name: "折叠目录", exact: true }).click();
    assert.equal(await page.locator(".md-outline-link").count(), 1);
    await page.getByRole("button", { name: "全部展开", exact: true }).click();
    assert.equal(await page.locator(".md-outline-link").count(), 8);

    await page.getByRole("button", { name: "查找正文", exact: true }).click();
    await page
      .getByRole("textbox", { name: "查找正文内容", exact: true })
      .fill("阅读体验");
    await until(
      async () => (await page.locator("mark[data-search-index]").count()) > 5,
      "search marks",
    );
    await page.getByRole("button", { name: "下一个匹配", exact: true }).click();
    assert.equal(
      await page.locator("mark.is-current").getAttribute("data-search-index"),
      "1",
    );
    await page.getByRole("button", { name: "关闭查找", exact: true }).click();
    assert.equal(await page.locator("mark[data-search-index]").count(), 0);
    await page.locator(".md-code-tools button").last().click();
    assert.equal(
      (await page.evaluate(() => navigator.clipboard.readText())).replace(
        /\r\n/g,
        "\n",
      ),
      '// # 不是标题\nconst message = "hello";\nconsole.log(message);',
    );

    await page.getByRole("button", { name: "阅读模式", exact: true }).click();
    assert(
      await page
        .locator(".markdown-page")
        .evaluate((node) => node.classList.contains("is-focused")),
    );
    await page.keyboard.press("Escape");
    await page
      .locator(".markdown-page.is-focused")
      .waitFor({ state: "detached" });
    await page.getByRole("button", { name: "阅读设置", exact: true }).click();
    await page.getByRole("switch").last().click();
    await page.getByRole("slider").focus();
    await page.keyboard.press("ArrowRight");
    await page.locator(".md-article h1").click();
    assert.equal(
      await page
        .locator(".md-article")
        .evaluate((node) => getComputedStyle(node).fontSize),
      "17px",
    );
    await page.screenshot({
      path: path.join(output, "settings.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.locator(".md-document-outline").waitFor({ state: "hidden" });
    const edited = content + "\n## 新增章节\n\n实时更新。";
    await page
      .getByRole("textbox", { name: "Markdown 源代码", exact: true })
      .fill(edited);
    await page.locator("#md-heading-新增章节").waitFor();
    assert.equal(await page.locator(".md-outline-link").count(), 9);
    await page.screenshot({
      path: path.join(output, "editing.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.locator("textarea").waitFor({ state: "detached" });
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page
      .getByRole("button", { name: "开始导出文档", exact: true })
      .click();
    const download = await downloading;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString("utf8"), edited);
    assert.equal(download.suggestedFilename(), "reading.md");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await page.reload();
    await page.locator("#md-heading-新增章节").waitFor();
    assert.equal(
      await page
        .locator(".md-article")
        .evaluate((node) => getComputedStyle(node).fontSize),
      "17px",
    );

    // Storage failure must leave edits visible and exportable, and must not claim completion.
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.evaluate(() => {
      window.__originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException("Quota exhausted", "QuotaExceededError");
      };
    });
    const unsaved = edited + "\n\nStorage failure draft";
    await page.locator("textarea").fill(unsaved);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.locator(".ant-alert-error").waitFor();
    assert.equal(await page.locator("textarea").inputValue(), unsaved);
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.__originalPut;
    });
    await page.getByRole("button", { name: "重试保存", exact: true }).click();
    await page.locator(".ant-alert-error").waitFor({ state: "detached" });
    await page.locator("textarea").waitFor({ state: "detached" });

    await page
      .locator("input[type=file]")
      .setInputFiles([file("empty.md", "")]);
    await page.getByText("文档还是空白，点击编辑开始书写").waitFor();
    assert.equal(await page.locator(".md-outline-link").count(), 0);
    await page
      .locator(".md-file-select")
      .filter({ hasText: "reading.md" })
      .click();
    await page.locator("#md-heading-新增章节").waitFor();
    await page
      .getByRole("button", { name: "移除 empty.md", exact: true })
      .click();
    await page.locator(".ant-popconfirm-buttons .ant-btn-primary").click();
    await page
      .locator(".md-file-select")
      .filter({ hasText: "empty.md" })
      .waitFor({ state: "detached" });
    await page.reload();
    await page.locator("#md-heading-新增章节").waitFor();
    assert.equal(await page.locator(".md-file").count(), 1);

    // UTF-16 BOM imports, invalid encodings, file limits and responsive layout.
    await page.locator("input[type=file]").setInputFiles({
      name: "utf16.md",
      mimeType: "text/markdown",
      buffer: Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from("# 编码测试", "utf16le"),
      ]),
    });
    await page.locator("#md-heading-编码测试").waitFor();
    await page.locator("input[type=file]").setInputFiles({
      name: "invalid.md",
      mimeType: "text/markdown",
      buffer: Buffer.from([0xff, 0x80, 0xfe]),
    });
    await page
      .getByText("invalid.md 编码无法识别，请另存为 UTF-8 后重新导入")
      .waitFor();
    await page.locator("input[type=file]").setInputFiles({
      name: "large.md",
      mimeType: "text/markdown",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 65),
    });
    await page.getByText("large.md 超过 5 MB，请拆分后导入").waitFor();
    assert.equal(await page.locator(".md-file").count(), 2);
    await page
      .locator(".md-file-select")
      .filter({ hasText: "reading.md" })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "阅读模式", exact: true }).click();
    await page.getByRole("button", { name: "打开文档库", exact: true }).click();
    await page
      .locator(".md-sidebar .md-file-select")
      .first()
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "收起文档库", exact: true }).click();
    await page.getByRole("button", { name: "文档目录", exact: true }).click();
    await page.getByRole("button", { name: "结语", exact: true }).click();
    await page
      .locator(".md-panels.is-outline-open")
      .waitFor({ state: "detached" });
    await page
      .locator(".ant-message-notice")
      .last()
      .waitFor({ state: "detached" });
    await page.screenshot({
      path: path.join(output, "mobile.png"),
      fullPage: true,
    });
    assert(
      await page
        .locator(".md-workspace")
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      "Reader must not overflow on mobile",
    );
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.locator(".md-document-outline").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "文档目录", exact: true }).click();
    await page
      .locator(".md-document-outline.is-drawer")
      .waitFor({ state: "visible" });
    const compactReadingBounds = await page
      .locator(".md-reading-scroll")
      .boundingBox();
    const compactOutlineBounds = await page
      .locator(".md-document-outline")
      .boundingBox();
    assert(
      Math.abs(compactOutlineBounds.x - compactReadingBounds.x) <= 1,
      "Compact outline uses a separate navigation view",
    );
    assert.equal(await page.locator(".md-preview").evaluate((node) => getComputedStyle(node).visibility), "hidden");
    await page.keyboard.press("Escape");
    await page.locator(".md-document-outline").waitFor({ state: "hidden" });
    await page.locator(".md-preview").waitFor({ state: "visible" });
    assert.deepEqual(errors, []);
    const recoveryContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const recoveryPage = await recoveryContext.newPage();
    await recoveryPage.addInitScript(() => {
      if (!sessionStorage.getItem("test-storage-restored")) {
        window.__realOpen = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function () {
          throw new DOMException("Blocked", "SecurityError");
        };
      }
    });
    await recoveryPage.goto(`${base}/#/professionalUtil/markdownUtil`);
    await recoveryPage.locator(".ant-alert-error").waitFor();
    await recoveryPage.evaluate(() => {
      IDBFactory.prototype.open = window.__realOpen;
      sessionStorage.setItem("test-storage-restored", "true");
    });
    await recoveryPage.locator(".ant-alert button").click();
    await recoveryPage
      .locator(".ant-alert-error")
      .waitFor({ state: "detached" });
    await recoveryPage
      .locator("input[type=file]")
      .setInputFiles(
        file(
          "recovery.md",
          "# Recovery\n\n" + paragraph.repeat(200) + "## End\n\nDone.",
        ),
      );
    await recoveryPage.locator("#md-heading-end").waitFor();
    await recoveryPage.locator(".md-outline-link").last().click();
    await recoveryPage.waitForFunction(() =>
      JSON.parse(localStorage.getItem("oraen:markdown:positions") || "[]").some(
        (entry) => entry[1] > 2000,
      ),
    );
    await recoveryPage.reload();
    await recoveryPage.locator("#md-heading-end").waitFor();
    assert(
      await recoveryPage
        .locator(".md-reading-scroll")
        .evaluate((node) => node.scrollTop > 2000),
      "Restore the reading position after refresh",
    );
    await recoveryContext.close();
    console.log(
      "PASS: outline, unique anchors, scroll spy, folding, safe rendering, find, code copy, focus, preferences, live editing, exact export, persistence, quota recovery, deletion, encoding validation, mobile layout, storage retry and reading position restoration.",
    );
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
