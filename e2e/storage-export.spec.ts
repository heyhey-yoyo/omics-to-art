import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

async function bytes(page: import('@playwright/test').Page, name: string, exact = true): Promise<Buffer> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

test('local file can be imported repeatedly; exports preserve format and application version', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles(resolve('fixtures/matrices/expression.csv'));
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByRole('heading', { name: '数据护照' })).toBeVisible();
    const manifest = JSON.parse((await bytes(page, '清单')).toString('utf8'));
    const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
    expect(manifest.application.version).toBe(pkg.version);
    expect(manifest.dataset.samples).toHaveLength(4);
    expect((await bytes(page, 'PNG')).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const svg = (await bytes(page, 'SVG')).toString('utf8');
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/NaN|Infinity/);
    const zip = await bytes(page, '导出作品包');
    expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304');
    for (const file of ['artwork.png', 'artwork.svg', 'manifest.json', 'README.txt']) expect(zip.includes(Buffer.from(file))).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('saved composition survives reload; denied storage keeps existing presets', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /表达矩阵示例/ }).click();
  await page.getByRole('button', { name: '☆ 收藏预设', exact: true }).click();
  const stored = await page.evaluate(() => localStorage.getItem('omics-to-art-presets-v1'));
  expect(JSON.parse(stored!)).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: /表达矩阵示例/ }).click();
  await expect(page.locator('.preset-list')).toContainText(JSON.parse(stored!)[0].name);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('test quota', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: '☆ 收藏预设', exact: true }).click();
  await expect(page.locator('body')).toContainText('浏览器无法保存收藏');
  expect(await page.evaluate(() => localStorage.getItem('omics-to-art-presets-v1'))).toBe(stored);
});
