/* Height regression: run against Vite with MARKDOWN_TEST_URL and PLAYWRIGHT_CHANNEL. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    await page.goto(`${process.env.MARKDOWN_TEST_URL || 'http://127.0.0.1:3000'}/#/professionalUtil/markdownUtil`);
    await page.locator('.md-welcome').waitFor();
    await page.locator('input[type=file]').setInputFiles({name: 'viewport.md', mimeType: 'text/markdown',
      buffer: Buffer.from('# Height check\n\n' + '## Chapter\n\nViewport content.\n\n'.repeat(80))});
    await page.locator('.md-article h1').waitFor();
    assert.equal(await page.locator('.md-document-info').count(), 0, 'Remove redundant filename/status row');
    await page.locator('.md-action-rail > .md-toolbar').waitFor();
    const initialReading = await page.locator('.md-reading-scroll').boundingBox();
    const initialControls = await page.locator('.md-toolbar').boundingBox();
    assert(initialReading.y < initialControls.y + initialControls.height, 'Body uses the space alongside the controls');
    assert(initialReading.x + initialReading.width <= initialControls.x, 'Right-side controls do not cover the body');
    await page.locator('.md-toolbar button[aria-label="编辑"] .anticon').waitFor({state: 'visible'});

    const output = path.join(os.tmpdir(), 'oraen-markdown-height-qa');
    await fs.mkdir(output, {recursive: true});
    const bounds = async (selector, minHeight) => {
      await assert.doesNotReject(() => page.waitForFunction(({selector, minHeight}) => {
        const node = document.querySelector(selector);
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        return rect.height >= minHeight && rect.top >= 0 && rect.bottom <= innerHeight;
      }, {selector, minHeight}, {timeout: 5000}), `${selector} must fill usable height and remain inside viewport`);
    };
    for (const [width, height] of [[1366, 768], [1366, 600], [1024, 600]]) {
      await page.setViewportSize({width, height});
      await bounds('.md-reading-scroll', height === 768 ? 450 : 320);
      await bounds('.md-reader-footer', 30);
      await page.getByRole('button', {name: '编辑', exact: true}).click();
      await bounds('textarea', height === 768 ? 410 : 300);
      await page.screenshot({path: path.join(output, `editing-${width}-${height}.png`)});
      await page.getByRole('button', {name: '保存', exact: true}).click();
    }
    await page.getByRole('button', {name: '查找正文', exact: true}).click();
    await bounds('.md-reading-scroll', 280);
    await page.getByRole('button', {name: '关闭查找', exact: true}).click();
    await page.getByRole('button', {name: '阅读模式', exact: true}).click();
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
    await page.getByRole('button', {name: '阅读设置', exact: true}).click();
    await page.getByRole('switch').last().waitFor({state: 'visible'});
    await page.locator('.md-article h1').click();
    await page.evaluate(() => document.exitFullscreen());
    await page.locator('.markdown-page.is-focused').waitFor({state: 'detached'});
    await page.getByRole('button', {name: '阅读模式', exact: true}).click();
    await page.waitForFunction(() => document.fullscreenElement === document.documentElement);

    await page.setViewportSize({width: 390, height: 844});
    await bounds('.md-reading-scroll', 650);
    await page.getByRole('button', {name: '编辑', exact: true}).click();
    await bounds('textarea', 600);
    await page.locator('textarea').fill('# Live viewport preview\n\nUpdated content');
    await page.getByRole('button', {name: '预览', exact: true}).click();
    await page.getByRole('heading', {name: 'Live viewport preview'}).waitFor();
    await bounds('.md-reading-scroll', 600);
    await page.screenshot({path: path.join(output, 'narrow-preview.png')});
    await page.setViewportSize({width: 740, height: 390});
    await bounds('.md-reading-scroll', 220);
    await page.getByRole('button', {name: '源码', exact: true}).click();
    await bounds('textarea', 220);
    await page.getByRole('button', {name: '保存', exact: true}).click();
    await page.getByRole('button', {name: '退出阅读模式', exact: true}).click();
    await page.waitForFunction(() => !document.fullscreenElement);

    await page.setViewportSize({width: 1366, height: 600});
    await bounds('.md-reading-scroll', 320);
    await page.screenshot({path: path.join(output, 'short-reading.png')});
    console.log(`PASS: viewport resize, reading/editing height, find bar, narrow live preview, focus and restore. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});

