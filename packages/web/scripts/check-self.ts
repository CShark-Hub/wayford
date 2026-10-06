/**
 * `pnpm --filter @wayford/web check:self`: the web app on its own Vite dev server, each listed
 * screen measured in Chromium at the projector's 1280 × 720 in Daylight and in Night, the floors
 * first, one line per shortfall and a summary. It exits 1 on any shortfall or failed screen, and 0
 * otherwise.
 *
 *   floors: text 4.5:1 and 16 px, targets 32 px
 *   cast · Night  link "Runs"  contrast 3.1 < 4.5
 *   1 screen checked in Daylight and Night: 1 shortfall
 */
import { type Browser, chromium } from "playwright";
import { THEME_NAMES } from "../src/theme.js";
import {
  checkScreen,
  SELF_CHECK_FLOOR,
  SELF_CHECK_SCREENS,
  SELF_CHECK_THEMES,
  type Shortfall,
  startWebApp,
} from "./self-check.js";

/**
 * One shortfall as a line, with the theme it was found in, its value as measured: rounding could
 * print 4.496 as "4.5 < 4.5". `collect` already cuts contrast to three decimals.
 */
function line(shortfall: Shortfall, theme: string): string {
  const element = `${shortfall.screen} · ${theme}  ${shortfall.role} ${JSON.stringify(shortfall.name)}`;
  if (shortfall.metric === "unmeasured") return `${element}  unmeasured`;
  return `${element}  ${shortfall.metric} ${shortfall.value} < ${shortfall.floor}`;
}

const { contrast, fontPx, targetPx } = SELF_CHECK_FLOOR;
console.log(`floors: text ${contrast}:1 and ${fontPx} px, targets ${targetPx} px`);

const app = await startWebApp();
let browser: Browser | undefined;
let found = 0;
let failed = 0;
try {
  browser = await chromium.launch();
  for (const screen of SELF_CHECK_SCREENS) {
    for (const theme of SELF_CHECK_THEMES) {
      const page = await browser.newPage();
      try {
        const check = await checkScreen(page, app.origin, screen, theme);
        for (const shortfall of check.shortfalls) console.log(line(shortfall, THEME_NAMES[theme]));
        found += check.shortfalls.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.log(`${screen.name} · ${THEME_NAMES[theme]}  failed: ${message}`);
        failed += 1;
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser?.close();
  await app.close();
}

const screens = SELF_CHECK_SCREENS.length;
const themes = SELF_CHECK_THEMES.map((theme) => THEME_NAMES[theme]).join(" and ");
console.log(
  `${screens} screen${screens === 1 ? "" : "s"} checked in ${themes}: ` +
    `${found} shortfall${found === 1 ? "" : "s"}` +
    (failed > 0 ? `, ${failed} failed` : ""),
);
process.exitCode = found > 0 || failed > 0 ? 1 : 0;
