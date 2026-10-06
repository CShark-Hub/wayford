/**
 * `pnpm --filter @wayford/web check:self`: the web app on its own Vite dev server, each listed
 * screen measured in Chromium at the projector's 1280 × 720, one line per shortfall and a summary.
 * It exits 1 on any shortfall or failed screen, and 0 otherwise.
 *
 *   personas  link "Runs"  contrast 3.1 < 4.5
 */
import { type Browser, chromium } from "playwright";
import { checkScreen, SELF_CHECK_SCREENS, type Shortfall, startWebApp } from "./self-check.js";

/**
 * One shortfall as a line, its value as measured: rounding could print 4.496 as "4.5 < 4.5".
 * `collect` already cuts contrast to three decimals.
 */
function line(shortfall: Shortfall): string {
  const element = `${shortfall.screen}  ${shortfall.role} ${JSON.stringify(shortfall.name)}`;
  if (shortfall.metric === "unmeasured") return `${element}  unmeasured`;
  return `${element}  ${shortfall.metric} ${shortfall.value} < ${shortfall.floor}`;
}

const app = await startWebApp();
let browser: Browser | undefined;
let found = 0;
let failed = 0;
try {
  browser = await chromium.launch();
  for (const screen of SELF_CHECK_SCREENS) {
    const page = await browser.newPage();
    try {
      const check = await checkScreen(page, app.origin, screen);
      for (const shortfall of check.shortfalls) console.log(line(shortfall));
      found += check.shortfalls.length;
    } catch (error) {
      console.log(`${screen.name}  failed: ${error instanceof Error ? error.message : error}`);
      failed += 1;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await app.close();
}

const screens = SELF_CHECK_SCREENS.length;
console.log(
  `${screens} screen${screens === 1 ? "" : "s"} checked: ${found} shortfall${found === 1 ? "" : "s"}` +
    (failed > 0 ? `, ${failed} failed` : ""),
);
process.exitCode = found > 0 || failed > 0 ? 1 : 0;
