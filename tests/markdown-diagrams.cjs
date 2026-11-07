const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const base = process.env.MARKDOWN_TEST_URL || "http://127.0.0.1:3000";
const fence = (kind, source) => "```" + kind + "\n" + source + "\n```\n\n";
const sources = {
  mermaid:
    "flowchart LR\n  A[开始] --> B{是否完成}\n  B -->|是| C[结束]\n  B -->|否| A",
  sequence:
    "sequenceDiagram\n  participant 用户\n  participant 服务\n  用户->>服务: 查询订单\n  服务-->>用户: 返回结果",
  dot: 'digraph G { node [fontname="Microsoft YaHei"]; input [label="输入"]; output [label="输出"]; input -> output; }',
  nomnoml: "[用户] -> [订单|编号;状态]\n[订单] -> [商品]",
  plantuml: "@startuml\nAlice -> Bob: 你好\nBob --> Alice: 已收到\n@enduml",
};
const content =
  "# 图表回归测试\n\n" +
  fence("mermaid", sources.mermaid) +
  fence("mmd", sources.sequence) +
  fence("graphviz", sources.dot) +
  fence("nomnoml", sources.nomnoml) +
  fence("puml", sources.plantuml) +
  fence("javascript", 'console.log("普通代码不变");');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      permissions: ["clipboard-read", "clipboard-write"],
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const externalRequests = [];
    const sourceUploads = [];
    await context.route(/^https?:\/\//, (route) => {
      const request = route.request();
      if (request.method() !== "GET") sourceUploads.push(request.url());
      if (new URL(request.url()).origin !== new URL(base).origin) {
        externalRequests.push(request.url());
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(base + "/#/professionalUtil/markdownUtil");
    await page.locator(".md-welcome").waitFor();
    await page.locator("input[type=file]").setInputFiles({
      name: "diagrams.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(content),
    });
    const blocks = page.locator(".md-diagram-block");
    await blocks.nth(4).waitFor({ state: "attached" });
    const picture = async (block) => {
      await block.scrollIntoViewIfNeeded();
      await block
        .locator(".md-diagram-picture img, [role=alert]")
        .waitFor({ timeout: 60000 });
      const alert = block.getByRole("alert");
      if (await alert.isVisible()) throw new Error(await alert.innerText());
      await page.waitForFunction(
        (el) => {
          const img = el.querySelector("img");
          return img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
        },
        await block.elementHandle(),
      );
    };
    for (let i = 0; i < 5; i++) await picture(blocks.nth(i));
    assert.equal(
      externalRequests.length,
      0,
      "All diagram engines load only bundled resources",
    );
    const mermaid = blocks.nth(0);
    await mermaid.getByRole("tab", { name: "源码", exact: true }).click();
    assert.equal(
      await mermaid.locator("pre code").textContent(),
      sources.mermaid,
    );
    await mermaid
      .getByRole("button", { name: "复制图表源码", exact: true })
      .click();
    assert.equal(
      (await page.evaluate(() => navigator.clipboard.readText())).replace(
        /\r\n/g,
        "\n",
      ),
      sources.mermaid,
    );
    await mermaid.getByRole("tab", { name: "图片", exact: true }).click();
    await picture(mermaid);
    const downloading = page.waitForEvent("download");
    await mermaid
      .getByRole("button", { name: "下载图表 SVG", exact: true })
      .click();
    const dl = await downloading;
    const stream = await dl.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const svg = Buffer.concat(chunks).toString("utf8");
    assert(svg.includes("<svg") && svg.includes("开始"));
    const plant = blocks.nth(4);
    await plant.scrollIntoViewIfNeeded();
    await picture(plant);
    assert.equal(externalRequests.length, 0);
    const clean = await plant
      .locator("img")
      .evaluate((img) => atob(img.src.split(",")[1]));
    assert(
      !clean.includes("<script") &&
        !clean.includes("onload") &&
        !clean.includes("<image") &&
        !clean.includes("@import"),
    );
    assert.equal(await page.evaluate(() => window.__diagramUnsafe), undefined);
    await page
      .locator(".md-code-block pre")
      .filter({ hasText: "普通代码不变" })
      .waitFor();

    // Existing local engines keep working offline; rapid edits must show the latest source.
    await context.setOffline(true);
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page
      .locator("textarea")
      .fill(
        "# 离线编辑\n\n" + fence("mermaid", "flowchart LR\nA[过期内容] --> B"),
      );
    await page
      .locator("textarea")
      .fill(
        "# 离线编辑\n\n" +
          fence("mermaid", "flowchart LR\nA[最新内容] --> B[完成]") +
          fence("dot", "digraph { fresh -> offline; }") +
          fence("nomnoml", "[本地] -> [离线]") +
          fence("puml", "@startuml\nAlice -> Bob: 离线本地绘制\n@enduml"),
      );
    for (let i = 0; i < 4; i++) await picture(blocks.nth(i));
    const latestSvg = await blocks.nth(0).locator("img").getAttribute("src");
    assert(
      Buffer.from(latestSvg.split(",")[1], "base64")
        .toString("utf8")
        .includes("最新内容"),
    );
    await context.setOffline(false);

    // Invalid input leaves the source available, and fixing it recovers without reloading.
    await page
      .locator("textarea")
      .fill(
        "# 错误恢复\n\n" +
          fence("mermaid", "flowchart LR\nA --> [") +
          fence("dot", "digraph { a -> ; }"),
      );
    for (let i = 0; i < 2; i++) {
      await blocks.nth(i).scrollIntoViewIfNeeded();
      await blocks.nth(i).getByRole("alert").waitFor({ timeout: 30000 });
    }
    await blocks
      .nth(0)
      .getByRole("button", { name: "查看源码", exact: true })
      .click();
    assert(
      (await blocks.nth(0).locator("pre").textContent()).includes("A --> ["),
    );
    await page
      .locator("textarea")
      .fill("# 已修复\n\n" + fence("mermaid", sources.mermaid));
    await blocks.nth(0).getByRole("tab", { name: "图片", exact: true }).click();
    await picture(blocks.nth(0));
    await page.getByRole("button", { name: "取消编辑", exact: true }).click();
    for (let i = 0; i < 5; i++) await picture(blocks.nth(i));

    // Export contains self-contained diagrams and preserved source, never more online requests.
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page
      .getByRole("combobox", { name: "文档导出格式", exact: true })
      .locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]')
      .click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("HTML · 独立网页", { exact: true })
      .click();
    const exportEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "开始导出文档", exact: true })
      .click();
    const exported = await exportEvent;
    const htmlStream = await exported.createReadStream();
    const htmlChunks = [];
    for await (const c of htmlStream) htmlChunks.push(c);
    const html = Buffer.concat(htmlChunks).toString("utf8");
    assert.equal((html.match(/data:image\/svg\+xml;base64,/g) || []).length, 5);
    assert(html.includes("图表源码") && html.includes("flowchart LR"));
    assert.equal(
      externalRequests.length,
      0,
      "Export draws PlantUML locally without uploading source",
    );
    const exportPage = await context.newPage();
    await exportPage.setContent(html);
    for (const img of await exportPage.locator(".export-diagram > img").all())
      assert(await img.evaluate((el) => el.complete && el.naturalWidth > 0));
    const pdf = await exportPage.pdf({ format: "A4", printBackground: true });
    assert(pdf.subarray(0, 4).toString() === "%PDF");
    await exportPage.close();
    await page
      .getByRole("combobox", { name: "文档导出格式", exact: true })
      .locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]')
      .click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("PNG · 文档长图", { exact: true })
      .click();
    const pngEvent = page.waitForEvent("download", { timeout: 45000 });
    await page
      .getByRole("button", { name: "开始导出文档", exact: true })
      .click();
    const pngDownload = await pngEvent;
    assert(pngDownload.suggestedFilename().endsWith(".png"));
    const pngStream = await pngDownload.createReadStream();
    const pngChunks = [];
    for await (const c of pngStream) pngChunks.push(c);
    const png = Buffer.concat(pngChunks);
    const pngInfo = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let diagramPixels = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] > 180 &&
          data[i] < 250 &&
          data[i + 1] > 170 &&
          data[i + 1] < 250 &&
          data[i + 2] > 245 &&
          data[i + 3] > 0
        )
          diagramPixels++;
      return { width: bitmap.width, diagramPixels };
    }, Array.from(png));
    assert.equal(pngInfo.width, 1350);
    assert(
      pngInfo.diagramPixels > 3000,
      "Long-image export includes the diagram fills, not blank image slots",
    );
    await fs.writeFile(path.join(os.tmpdir(), "oraen-diagram-export.png"), png);
    await fs.writeFile(path.join(os.tmpdir(), "oraen-diagram-export.pdf"), pdf);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();

    // Remote include directives may not make diagram text leave the browser.
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page
      .locator("textarea")
      .fill(
        "# 网络引用已禁用\n\n" +
          fence(
            "puml",
            "@startuml\n!includeurl https://invalid.example/private-code.puml\nAlice -> Bob: private marker\n@enduml",
          ),
      );
    await blocks.nth(0).scrollIntoViewIfNeeded();
    await blocks.nth(0).locator("img,[role=alert]").waitFor();
    assert.equal(
      externalRequests.length,
      0,
      "External includes never invoke a network service",
    );
    await page
      .locator("textarea")
      .fill(
        "# 本地修复\n\n" +
          fence("puml", "@startuml\nAlice -> Bob: 本地更新\n@enduml"),
      );
    await picture(blocks.nth(0));
    await page.getByRole("button", { name: "取消编辑", exact: true }).click();
    await page.getByRole("button", { name: "阅读模式", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    for (let i = 0; i < 5; i++) await picture(blocks.nth(i));
    assert(
      await page
        .locator(".md-reading-scroll")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "Diagrams do not widen the document on mobile",
    );
    const output = path.join(os.tmpdir(), "oraen-markdown-diagrams-qa");
    await fs.mkdir(output, { recursive: true });
    await mermaid.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mermaid.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "reading.png") });
    const otherCharts = [
      [
        "classDiagram\nclass Animal {\n+int age\n+eat()\n}\nAnimal <|-- Dog",
        "Animal",
      ],
      [
        "stateDiagram-v2\n[*] --> Active\nActive --> Finished\nFinished --> [*]",
        "Active",
      ],
      ["erDiagram\nCUSTOMER ||--o{ ORDER : places", "ORDER"],
      [
        "gantt\ntitle Project\ndateFormat YYYY-MM-DD\nsection Work\nDesign :a1, 2026-01-01, 5d",
        "Design",
      ],
      ['pie title Food\n"Vegetables" : 45\n"Fruit" : 55', "Vegetables"],
      ["mindmap\n  root((Kitchen))\n    Food\n    Tools", "Kitchen"],
      ['gitGraph\ncommit id: "Seed"\ncommit id: "Next"', "Seed"],
      ["timeline\n  title Schedule\n  2026 : Plan\n  2027 : Build", "Plan"],
    ];
    await page
      .getByRole("button", { name: "退出阅读模式", exact: true })
      .click();
    await page.locator("input[type=file]").setInputFiles({
      name: "mermaid-types.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# More charts\n\n" +
          otherCharts.map(([source]) => fence("mermaid", source)).join(""),
      ),
    });
    for (let i = 0; i < otherCharts.length; i++) {
      await picture(blocks.nth(i));
      const src = await blocks.nth(i).locator("img").getAttribute("src");
      assert(
        Buffer.from(src.split(",")[1], "base64")
          .toString("utf8")
          .includes(otherCharts[i][1]),
        "Diagram labels survive SVG normalization: " + otherCharts[i][1],
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(sourceUploads, []);
    console.log(
      "PASS: local Mermaid/sequence/DOT/nomnoml, tabs, copy/SVG download, local PlantUML and blocked remote includes, SVG sanitization, offline/live editing, syntax recovery, self-contained HTML/PNG/print PDF exports and mobile layout.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
