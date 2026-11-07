/* Markdown interaction regression. Set MARKDOWN_TEST_URL to the running app. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const mdFile = (name, text) => ({name, mimeType: 'text/markdown', buffer: Buffer.from(text)});
(async () => {
  const browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const original = '# 产品周报\n\n' + Array.from({length: 5}, (_, i) =>
      `## 第 ${i + 1} 周\n\n周报正文。\n\n### 指标 ${i + 1}\n\n${'阅读内容。\n\n'.repeat(12)}\n`).join('');
    await page.goto(`${process.env.MARKDOWN_TEST_URL || 'http://127.0.0.1:3000'}/#/professionalUtil/markdownUtil`);
    await page.locator('.md-welcome').waitFor();
    await page.locator('input[type=file]').setInputFiles(mdFile('weekly.md', original));
    await page.getByRole('heading', {name: '产品周报'}).waitFor();
    await page.locator('.md-panels.has-outline').waitFor();
    const toggle = page.getByRole('button', {name: '文档目录', exact: true});
    await toggle.evaluate(node => node.dataset.stableControl = 'yes');
    for (let i = 0; i < 5; i++) {
      await toggle.click();
      await page.locator('#md-document-outline').waitFor({state: 'hidden'});
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await toggle.getAttribute('data-stable-control'), 'yes', 'Closing the outline does not replace the control');
      assert.equal(await page.locator('.md-article .md-toolbar').count(), 0, 'Document never contains application controls');
      await toggle.click();
      await page.locator('#md-document-outline').waitFor({state: 'visible'});
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    }
    await page.getByRole('button', {name: '收起文档目录', exact: true}).click();
    await page.locator('#md-document-outline').waitFor({state: 'hidden'});
    await toggle.click();
    await page.getByRole('button', {name: '折叠第 1 周', exact: true}).click();
    assert.equal(await page.locator('.md-outline-link').filter({hasText: '指标 1'}).count(), 0);
    await page.getByRole('button', {name: '展开第 1 周', exact: true}).click();
    await page.locator('.md-outline-link').filter({hasText: '指标 1'}).waitFor();
    await page.getByRole('textbox', {name: '筛选章节', exact: true}).fill('指标 1');
    await page.getByRole('button', {name: '折叠第 1 周', exact: true}).click();
    assert.equal(await page.locator('.md-outline-link').filter({hasText: '指标 1'}).count(), 0, 'Filtered branches can collapse');
    await page.getByRole('button', {name: '展开第 1 周', exact: true}).click();
    await page.locator('.md-outline-link').filter({hasText: '指标 1'}).waitFor();
    await page.getByRole('textbox', {name: '筛选章节', exact: true}).fill('');
    await page.locator('.md-reading-scroll').evaluate(node => node.scrollTop = 700);
    await toggle.click();
    await page.locator('#md-document-outline').waitFor({state: 'hidden'});
    assert(await page.locator('.md-reading-scroll').evaluate(node => node.scrollTop > 500), 'Collapsing keeps the reading position');
    assert(await toggle.isVisible(), 'Controls remain visible after scrolling the document');
    const read = await page.locator('.md-reading-scroll').boundingBox();
    const rail = await page.locator('.md-action-rail').boundingBox();
    assert(read.x + read.width <= rail.x + 1, 'Controls occupy their own area');
    await toggle.click();
    await page.getByRole('button', {name: '回到顶部', exact: true}).click();

    // Cancel must discard the draft without overwriting the saved document.
    await page.getByRole('button', {name: '编辑', exact: true}).click();
    await page.locator('textarea').fill('# 不该被保存的草稿\n\nDiscard this.');
    await page.getByRole('heading', {name: '不该被保存的草稿'}).waitFor();
    await page.getByRole('button', {name: '取消编辑', exact: true}).click();
    await page.getByRole('heading', {name: '产品周报'}).waitFor();
    await page.reload();
    await page.getByRole('button', {name: '编辑', exact: true}).click();
    assert.equal(await page.locator('textarea').inputValue(), original);
    const saved = '# 已保存的周报\n\n' + original;
    await page.locator('textarea').fill(saved);
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await page.locator('textarea').waitFor({state: 'detached'});
    await page.reload();
    await page.getByRole('heading', {name: '已保存的周报'}).waitFor();

    // Failed saves keep the draft recoverable, and cancel still restores durable content.
    await page.getByRole('button', {name: '编辑', exact: true}).click();
    await page.locator('textarea').fill('# 存储失败草稿');
    await page.evaluate(() => {
      window.__savedPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    });
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await page.locator('.ant-alert-error').waitFor();
    assert.equal(await page.locator('textarea').inputValue(), '# 存储失败草稿');
    await page.getByRole('button', {name: '取消编辑', exact: true}).click();
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.__savedPut; });
    await page.reload();
    await page.getByRole('heading', {name: '已保存的周报'}).waitFor();

    // The visible import button must open a real file chooser and keep an in-progress draft.
    await page.getByRole('button', {name: '编辑', exact: true}).click();
    const keptDraft = saved + '\n\nImport must not erase this draft.';
    await page.locator('textarea').fill(keptDraft);
    const chooserEvent = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: '导入 MD 文件', exact: true}).click();
    await (await chooserEvent).setFiles(mdFile('second.md', '# 第二篇文档'));
    await page.locator('.md-file-select').filter({hasText: 'second.md'}).waitFor();
    assert.equal(await page.locator('textarea').inputValue(), keptDraft);
    await page.locator('.md-file-select').filter({hasText: 'second.md'}).click();
    assert.equal(await page.locator('textarea').inputValue(), keptDraft, 'Switching cannot silently drop a dirty draft');
    await page.getByRole('button', {name: '取消编辑', exact: true}).click();
    await page.locator('.md-file-select').filter({hasText: 'second.md'}).click();
    await page.getByRole('heading', {name: '第二篇文档'}).waitFor();

    const output = path.join(os.tmpdir(), 'oraen-markdown-design-qa');
    await fs.mkdir(output, {recursive: true});
    await page.locator('.md-file-select').filter({hasText: 'weekly.md'}).click();
    await page.screenshot({path: path.join(output, 'desktop-reading.png')});
    await page.getByRole('button', {name: '编辑', exact: true}).click();
    await page.screenshot({path: path.join(output, 'desktop-editing.png')});
    await page.getByRole('button', {name: '取消编辑', exact: true}).click();
    await page.getByRole('button', {name: '阅读模式', exact: true}).click();
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('.markdown-page.is-narrow').waitFor();
    const importButton = page.getByRole('button', {name: '导入 MD 文件', exact: true});
    assert.equal(await page.getByRole('button', {name: '导入 MD 文件', exact: true, includeHidden: true}).count(), 1, 'There is exactly one import entry');
    assert.equal(await page.locator('.md-action-rail button[aria-label="导入 MD 文件"]').count(), 0);
    await page.getByRole('button', {name: '打开文档库', exact: true}).click();
    assert(await importButton.isVisible(), 'The single import entry remains accessible through the document library');
    await page.getByRole('button', {name: '收起文档库', exact: true}).click();
    for (let i = 0; i < 3; i++) {
      await toggle.click();
      await page.locator('#md-document-outline').waitFor({state: 'visible'});
      assert.equal(await page.locator('.md-preview').evaluate(node => getComputedStyle(node).visibility), 'hidden');
      await toggle.click();
      await page.locator('#md-document-outline').waitFor({state: 'hidden'});
      await page.locator('.md-preview').waitFor({state: 'visible'});
    }
    await page.screenshot({path: path.join(output, 'narrow-reading.png')});
    await page.getByRole('button', {name: '编辑', exact: true}).click();
    assert(await page.getByRole('button', {name: '保存', exact: true}).isVisible());
    assert(await page.getByRole('button', {name: '取消编辑', exact: true}).isVisible());
    await page.screenshot({path: path.join(output, 'narrow-editing.png')});
    await page.getByRole('button', {name: '取消编辑', exact: true}).click();
    assert.deepEqual(errors, []);
    console.log(`PASS: repeated outline toggles, branch/search folding, stationary controls, draft cancel/save persistence, visible import, import during edit and narrow layouts. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
