import { expect, test } from "@playwright/test";

test("expression demo reaches the studio and exposes all export formats", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /表达矩阵示例/ }).click();
  await expect(page.getByRole("heading", { name: "数据护照" })).toBeVisible();
  await expect(page.getByRole("button", { name: "PNG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "SVG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "清单" })).toBeVisible();
  await expect(page.getByRole("button", { name: /ZIP 全套/ })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("differential demo selects 差异绽放", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /差异花园示例/ }).click();
  await expect(page.getByRole("button", { name: /差异绽放/ })).toHaveClass(/active/);
  await expect(page.getByText("差异结果", { exact: true })).toBeVisible();
});
