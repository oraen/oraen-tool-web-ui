const { chromium } = require("playwright");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");
const JSZip = require("jszip");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const base = process.env.LOCAL_TOOLS_TEST_URL || "http://127.0.0.1:4175";
const out = path.join(os.tmpdir(), "oraen-local-tools-qa");
const upload = (name, buffer, mimeType = "application/octet-stream") => ({
  name,
  buffer,
  mimeType,
});
async function until(check, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error(`Timed out: ${label}`);
}
async function download(page, action) {
  const waiting = page.waitForEvent("download", { timeout: 45000 });
  await action();
  const item = await waiting;
  const stream = await item.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: item.suggestedFilename(), bytes: Buffer.concat(chunks) };
}
async function select(page, label, option) {
  await page
    .getByRole("combobox", { name: label, exact: true })
    .locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]')
    .click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(option, { exact: true })
    .click();
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1520, height: 1080 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  const uploads = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Browser error:", error.message);
  });
  page.on("request", (request) => {
    if (request.method() === "POST") uploads.push(request.url());
  });
  try {
    await page.goto(`${base}/#/fileUtil/imageBatch`);
    await page
      .getByRole("heading", { name: "图片批量处理", exact: true })
      .waitFor();
    const fixtures = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      const pixels = ctx.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = (i * 17) % 251;
        pixels.data[i + 1] = (i * 7) % 239;
        pixels.data[i + 2] = (i * 11) % 241;
        pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      const noise = canvas.toDataURL("image/png").split(",")[1];
      ctx.clearRect(0, 0, 640, 360);
      ctx.fillStyle = "#e54235";
      ctx.fillRect(200, 100, 100, 100);
      return {
        noise,
        transparent: canvas.toDataURL("image/png").split(",")[1],
      };
    });
    const image = Buffer.from(fixtures.noise, "base64");
    const transparent = Buffer.from(fixtures.transparent, "base64");
    await page
      .locator("#image-batch-input")
      .setInputFiles([
        upload("same.png", image, "image/png"),
        upload("same.png", transparent, "image/png"),
      ]);
    await until(
      () =>
        page
          .locator(".tool-file-card")
          .count()
          .then((count) => count === 2),
      "image import",
    );
    await page
      .getByRole("spinbutton", { name: "最长边", exact: true })
      .fill("320");
    await page.getByRole("spinbutton", { name: "最长边", exact: true }).blur();
    await select(page, "裁剪比例", "1 : 1 · 正方形");
    await page
      .getByRole("spinbutton", { name: "目标体积", exact: true })
      .fill("30");
    await page
      .getByRole("spinbutton", { name: "目标体积", exact: true })
      .blur();
    await page
      .getByRole("textbox", { name: "文字水印", exact: true })
      .fill("Local only");
    await page.getByRole("button", { name: "开始处理", exact: true }).click();
    await until(
      async () =>
        (await page.getByText("处理完成", { exact: true }).count()) === 2,
      "image processing",
    );
    const imageZip = await download(page, () =>
      page.getByRole("button", { name: /打包下载/ }).click(),
    );
    const packed = await JSZip.loadAsync(imageZip.bytes);
    const outputFiles = Object.values(packed.files).filter(
      (entry) => !entry.dir,
    );
    assert.equal(outputFiles.length, 2);
    assert.notEqual(outputFiles[0].name, outputFiles[1].name);
    for (const file of outputFiles) {
      const data = await file.async("uint8array");
      assert(data.byteLength <= 30 * 1024);
      const dimensions = await page.evaluate(async (bytes) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)]),
        );
        const result = [bitmap.width, bitmap.height];
        bitmap.close();
        return result;
      }, Array.from(data));
      assert.equal(dimensions[0], dimensions[1]);
      assert(dimensions[0] <= 320);
    }
    await page.screenshot({
      path: path.join(out, "images.png"),
      fullPage: true,
    });
    console.log(
      "PASS images: batch, crop, resize, watermark, target size, duplicate names and ZIP contents",
    );

    await select(page, "导出格式", "PNG · 保留透明");
    await page
      .getByRole("spinbutton", { name: "目标体积", exact: true })
      .fill("1");
    await page
      .getByRole("spinbutton", { name: "目标体积", exact: true })
      .blur();
    await page.getByText("允许缩小尺寸以满足体积", { exact: true }).click();
    await page.getByRole("button", { name: "开始处理", exact: true }).click();
    await page.getByText("未达到目标体积", { exact: true }).first().waitFor();
    await until(
      async () =>
        await page
          .getByRole("button", { name: "开始处理", exact: true })
          .isEnabled(),
      "PNG target completion",
    );
    await page.evaluate(() => {
      window.__originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (...args) {
        const canvas = this;
        setTimeout(() => window.__originalToBlob.apply(canvas, args), 250);
      };
    });
    await page.getByRole("button", { name: "开始处理", exact: true }).click();
    await page.getByRole("button", { name: "取消处理", exact: true }).click();
    await until(
      async () =>
        await page
          .getByRole("button", { name: "开始处理", exact: true })
          .isEnabled(),
      "cancel image processing",
    );
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.toBlob = window.__originalToBlob;
    });
    assert.equal(await page.locator(".tool-file-card").count(), 2);
    console.log(
      "PASS image boundaries: unattainable PNG target is explicit; cancellation restores usable controls",
    );

    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    [
      [200, 300],
      [400, 200],
      [200, 400],
    ].forEach((size, index) => {
      const p = source.addPage(size);
      p.drawRectangle({
        x: 0,
        y: 0,
        width: size[0],
        height: size[1],
        color: [rgb(0.9, 0.8, 0.7), rgb(0.7, 0.9, 0.8), rgb(0.8, 0.7, 0.9)][
          index
        ],
      });
      p.drawText(`Page ${index + 1}`, { x: 20, y: 80, size: 18, font });
      if (!index) p.setRotation(degrees(90));
    });
    const pdf = Buffer.from(await source.save());
    await page.goto(`${base}/#/fileUtil/pdfManager`);
    await page
      .getByRole("heading", { name: "PDF 页面管理", exact: true })
      .waitFor();
    await page
      .locator("#pdf-manager-input")
      .setInputFiles(upload("source.pdf", pdf, "application/pdf"));
    await until(
      async () => (await page.locator(".pdf-page-card").count()) === 3,
      "PDF import",
    );
    await until(
      () =>
        page
          .locator(".pdf-page-card canvas")
          .evaluateAll((nodes) =>
            nodes.every((node) => node.width > 0 && node.height > 0),
          ),
      "PDF thumbnails",
    );
    await page
      .getByRole("button", { name: "前移第 3 页", exact: true })
      .click();
    await page
      .getByRole("button", { name: "前移第 2 页", exact: true })
      .click();
    await page
      .getByRole("button", { name: "旋转第 1 页", exact: true })
      .click();
    await page
      .getByRole("button", { name: "删除第 2 页", exact: true })
      .click();
    assert.equal(await page.locator(".pdf-page-card").count(), 2);
    await page
      .getByRole("button", { name: "撤销页面操作", exact: true })
      .click();
    assert.equal(await page.locator(".pdf-page-card").count(), 3);
    const all = await download(page, () =>
      page.getByRole("button", { name: "导出全部PDF", exact: true }).click(),
    );
    const merged = await PDFDocument.load(all.bytes);
    assert.deepEqual(
      merged
        .getPages()
        .map((p) => [p.getWidth(), p.getHeight(), p.getRotation().angle]),
      [
        [200, 400, 90],
        [200, 300, 90],
        [400, 200, 0],
      ],
    );
    await page
      .getByRole("textbox", { name: "页码范围", exact: true })
      .fill("1,3");
    await page.getByRole("button", { name: "按页码选择", exact: true }).click();
    const extracted = await download(page, () =>
      page.getByRole("button", { name: "提取选中PDF", exact: true }).click(),
    );
    assert.equal((await PDFDocument.load(extracted.bytes)).getPageCount(), 2);
    const split = await download(page, () =>
      page.getByRole("button", { name: "逐页拆分ZIP", exact: true }).click(),
    );
    const splitZip = await JSZip.loadAsync(split.bytes);
    assert.equal(
      Object.values(splitZip.files).filter((entry) => !entry.dir).length,
      2,
    );
    for (const entry of Object.values(splitZip.files).filter(
      (entry) => !entry.dir,
    ))
      assert.equal(
        (
          await PDFDocument.load(await entry.async("uint8array"))
        ).getPageCount(),
        1,
      );
    await page
      .locator("#pdf-manager-input")
      .setInputFiles(upload("image.png", image, "image/png"));
    await until(
      async () => (await page.locator(".pdf-page-card").count()) === 4,
      "image to PDF",
    );
    const withImage = await download(page, () =>
      page.getByRole("button", { name: "导出全部PDF", exact: true }).click(),
    );
    const imagePdf = await PDFDocument.load(withImage.bytes);
    assert.equal(imagePdf.getPageCount(), 4);
    assert(Math.abs(imagePdf.getPage(3).getWidth() - 841.89) < 0.1);
    await page.screenshot({ path: path.join(out, "pdf.png"), fullPage: true });
    await page
      .getByRole("textbox", { name: "页码范围", exact: true })
      .fill("0-999");
    await page.getByRole("button", { name: "按页码选择", exact: true }).click();
    await page
      .getByText("页码需在 1–4 之间，区间需从小到大", { exact: true })
      .waitFor();
    const orderBefore = await page
      .locator(".pdf-page-card small")
      .allTextContents();
    await page
      .getByRole("button", { name: "拖动第 1 页", exact: true })
      .focus();
    await page.keyboard.press("Space");
    await until(
      () =>
        page
          .locator(".pdf-page-card")
          .first()
          .evaluate((node) => node.style.opacity === "0.6"),
      "keyboard drag activation",
    );
    await page.waitForTimeout(120);
    await page.keyboard.press("ArrowRight");
    await until(
      () =>
        page
          .locator(".pdf-page-card")
          .first()
          .evaluate(
            (node) =>
              node.style.transform.startsWith("translate3d(") &&
              !node.style.transform.startsWith("translate3d(0px, 0px, 0px)"),
          ),
      "keyboard drag movement",
    );
    await page.waitForTimeout(240);
    await page.keyboard.press("Space");
    await until(
      async () =>
        (await page.locator(".pdf-page-card small").allTextContents())[1] ===
        orderBefore[0],
      "keyboard page reorder",
    );
    await page
      .getByRole("button", { name: "撤销页面操作", exact: true })
      .click();
    await page.getByRole("button", { name: "全选", exact: true }).click();
    await page.getByText("删除选中", { exact: true }).click();
    assert.equal(await page.locator(".pdf-page-card").count(), 0);
    await page
      .getByRole("button", { name: "撤销页面操作", exact: true })
      .click();
    assert.equal(await page.locator(".pdf-page-card").count(), 4);
    await page
      .locator("#pdf-manager-input")
      .setInputFiles(
        upload("broken.pdf", Buffer.from("not-a-pdf"), "application/pdf"),
      );
    await page
      .getByText("broken.pdf：PDF 无法读取，文件可能已损坏或不是有效 PDF", {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".pdf-page-card").count(), 4);
    console.log(
      "PASS PDF: local thumbnails, order, source rotation, delete/undo, extraction, split ZIP and image-to-A4 PDF",
    );

    await page.goto(`${base}/#/fileUtil/zipTool`);
    await page
      .getByRole("heading", { name: "ZIP 压缩包", exact: true })
      .waitFor();
    await page.getByRole("tab", { name: "创建 ZIP", exact: true }).click();
    await page
      .locator("#zip-create-input")
      .setInputFiles([
        upload("same.txt", Buffer.from("First")),
        upload("same.txt", Buffer.from("Second")),
      ]);
    const created = await download(page, () =>
      page.getByRole("button", { name: "创建并下载ZIP", exact: true }).click(),
    );
    const createdZip = await JSZip.loadAsync(created.bytes);
    assert.deepEqual(
      (
        await Promise.all(
          Object.values(createdZip.files)
            .filter((entry) => !entry.dir)
            .map((entry) => entry.async("string")),
        )
      ).sort(),
      ["First", "Second"],
    );
    await page
      .getByRole("tab", { name: "打开 / 提取 ZIP", exact: true })
      .click();
    const fixtureZip = new JSZip();
    fixtureZip.file(
      "notes/中文.md",
      "# 本地文档\n\n安全预览 <script>alert(1)</script>",
    );
    fixtureZip.file("123", "Numeric path");
    fixtureZip.file("empty.txt", "");
    fixtureZip.file("binary.bin", new Uint8Array([0, 1, 255, 42]));
    fixtureZip.file("legacy\\windows.txt", "Windows path");
    const fixtureBytes = await fixtureZip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    await page
      .locator("#zip-open-input")
      .setInputFiles(upload("files.zip", fixtureBytes));
    await page.getByText("5 个文件 · 展开后", { exact: false }).waitFor();
    await page
      .getByRole("button", { name: "notes/中文.md", exact: true })
      .click();
    await page.locator(".zip-text-preview").waitFor();
    assert(
      (await page.locator(".zip-text-preview").textContent()).includes(
        "<script>",
      ),
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    const numeric = await download(page, () =>
      page.getByRole("button", { name: "提取 123", exact: true }).click(),
    );
    assert.equal(numeric.bytes.toString(), "Numeric path");
    await page
      .getByRole("button", { name: "选择全部文件", exact: true })
      .click();
    const unzipped = await download(page, () =>
      page.getByRole("button", { name: /导出选中文件/ }).click(),
    );
    const selectedZip = await JSZip.loadAsync(unzipped.bytes);
    assert.equal(
      await selectedZip.file("legacy/windows.txt").async("string"),
      "Windows path",
    );
    assert.equal(
      await selectedZip.file("notes/中文.md").async("string"),
      "# 本地文档\n\n安全预览 <script>alert(1)</script>",
    );
    assert.equal(
      (await selectedZip.file("empty.txt").async("uint8array")).length,
      0,
    );
    await page.screenshot({ path: path.join(out, "zip.png"), fullPage: true });
    const unsafe = new JSZip();
    unsafe.file("../escape.txt", "no");
    await page
      .locator("#zip-open-input")
      .setInputFiles(
        upload(
          "unsafe.zip",
          await unsafe.generateAsync({ type: "nodebuffer" }),
        ),
      );
    await page
      .getByText("压缩包包含不安全的文件路径", { exact: true })
      .waitFor();
    const damaged = new JSZip();
    damaged.file("damaged.txt", "payload-for-crc");
    const damagedBytes = await damaged.generateAsync({
      type: "nodebuffer",
      compression: "STORE",
    });
    const position = damagedBytes.indexOf(Buffer.from("payload-for-crc"));
    damagedBytes[position] ^= 1;
    await page
      .locator("#zip-open-input")
      .setInputFiles(upload("damaged.zip", damagedBytes));
    await page
      .getByRole("button", { name: "提取 damaged.txt", exact: true })
      .click();
    await page
      .getByText("文件校验失败，压缩包可能已损坏", { exact: true })
      .waitFor();
    console.log(
      "PASS ZIP: duplicate names, directories, Unicode/numeric names, text preview, empty/binary extraction, CRC failure and unsafe path rejection",
    );

    await page.goto(`${base}/#/professionalUtil/markdownUtil`);
    await page.locator(".markdown-page").waitFor();
    const md =
      "# Export sample\n\n中文内容与 **bold text**。\n\n[Go to details](#details)\n\n| Name | Value |\n| --- | --- |\n| Check | 42 |\n\n## Details\n\n- [x] Complete\n\n```js\nconst answer = 42;\n```\n\n<script>window.__exportUnsafe=true</script>";
    await page
      .locator("input[type=file]")
      .setInputFiles(upload("export.md", Buffer.from(md), "text/markdown"));
    await page.locator("#md-heading-export-sample").waitFor();
    await page.getByRole("button", { name: "导出", exact: true }).click();
    const original = await download(page, () =>
      page.getByRole("button", { name: "开始导出文档", exact: true }).click(),
    );
    assert.equal(original.bytes.toString(), md);
    await select(page, "文档导出格式", "HTML · 独立网页");
    await page.getByRole("dialog").getByText("纸感", { exact: true }).click();
    const html = await download(page, () =>
      page.getByRole("button", { name: "开始导出文档", exact: true }).click(),
    );
    assert(html.bytes.toString().includes("Content-Security-Policy"));
    assert(html.bytes.toString().includes('href="#md-heading-details"'));
    assert(
      !html.bytes
        .toString()
        .includes("<script>window.__exportUnsafe=true</script>"),
    );
    const exportedPage = await context.newPage();
    await exportedPage.setContent(html.bytes.toString());
    assert.equal(await exportedPage.locator("table").count(), 1);
    assert.equal(
      await exportedPage.evaluate(() => window.__exportUnsafe),
      undefined,
    );
    const printed = await exportedPage.pdf({
      format: "A4",
      printBackground: true,
    });
    const printedPdf = await PDFDocument.load(printed);
    assert(printedPdf.getPageCount() > 0);
    await fs.writeFile(path.join(out, "markdown.pdf"), printed);
    await exportedPage.close();
    await select(page, "文档导出格式", "PNG · 文档长图");
    const png = await download(page, () =>
      page.getByRole("button", { name: "开始导出文档", exact: true }).click(),
    );
    assert(png.name.endsWith(".png"));
    const pngInfo = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          pixels[i] < 150 &&
          pixels[i + 1] < 150 &&
          pixels[i + 2] < 150 &&
          pixels[i + 3] > 0
        )
          ink++;
      return { width: bitmap.width, height: bitmap.height, ink };
    }, Array.from(png.bytes));
    assert.equal(pngInfo.width, 1350);
    assert(
      pngInfo.ink > 2000,
      "Exported image must contain text, not a blank canvas",
    );
    await fs.writeFile(path.join(out, "markdown.png"), png.bytes);
    await page.screenshot({
      path: path.join(out, "markdown-export.png"),
      fullPage: true,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    const longMd =
      "# Long document\n\n" +
      Array.from(
        { length: 100 },
        (_, i) =>
          `## Section ${i + 1}\n\n中文长文导出测试，内容应完整保留。Paragraph ${i + 1} content.\n\n`,
      ).join("") +
      "## FINAL MARKER\n\nEnd of document.";
    await page
      .locator("input[type=file]")
      .setInputFiles(upload("long.md", Buffer.from(longMd), "text/markdown"));
    await page.locator("#md-heading-long-document").waitFor();
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await select(page, "文档导出格式", "PNG · 文档长图");
    const longPng = await download(page, () =>
      page.getByRole("button", { name: "开始导出文档", exact: true }).click(),
    );
    assert(longPng.name.endsWith(".zip"));
    const longZip = await JSZip.loadAsync(longPng.bytes);
    const parts = Object.values(longZip.files).filter((entry) => !entry.dir);
    assert(parts.length > 1);
    const last = await parts[parts.length - 1].async("uint8array");
    const lastInk = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] < 120 &&
          data[i + 1] < 120 &&
          data[i + 2] < 120 &&
          data[i + 3]
        )
          ink++;
      bitmap.close();
      return ink;
    }, Array.from(last));
    assert(lastInk > 100, "Last long-image segment must contain content");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    console.log(
      `PASS long Markdown image: ${parts.length} segments, including nonblank final segment`,
    );
    console.log(
      "PASS Markdown: exact source, styled standalone HTML, safe content/anchors, print PDF and nonblank Chinese long image",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(uploads, []);
    console.log(`ALL LOCAL FILE TOOLS PASSED. Artifacts: ${out}`);
  } catch (error) {
    await page
      .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
      .catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
