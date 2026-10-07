/**
 * The page io opens for the Lens's measurement and for axe-core (`docs/adr/0003-any-target.md`, D2
 * and D5): a target-app page, named by `page=`, or any page, named by `url=`, carried by its whole
 * URL, which is the key of everything io keeps about it. `routes/measure.ts` and `routes/axe.ts`
 * read one from their query through `pageQuery`, and the report from the pages its runs stood on
 * (`analyst-axe.ts`).
 *
 * No Playwright and no agent runtime here, so it sits in io's barrel.
 */
import { AxeUrl } from "@wayford/core";
import { TARGET_APP_DEFAULT_QUERY, TARGET_APP_PATHS } from "@wayford/filter/serve-target-app";
import { z } from "zod";

/** A page io opens for the Lens or axe-core (ADR 0003 D2). */
export interface PageRef {
  /** Its whole URL as `new URL(…).href` spells it: the key of everything io keeps about it. */
  url: string;
  /**
   * A target-app page, named by `page=` or by a run on the target app's origin: opened as runs on
   * the app are, with the strict `settle`. Any other page is opened as given, with the lenient one.
   */
  onTargetApp: boolean;
}

/**
 * `path` with `search` on the target app at `origin`:
 * `targetAppPage(origin, "/deliveries", TARGET_APP_DEFAULT_QUERY)`. At the app's defaults its URL
 * is spelled as `startUrlFor` spells a run's start URL there.
 */
export function targetAppPage(origin: string, path: string, search: string): PageRef {
  return { url: new URL(`${origin}${path}${search}`).href, onTargetApp: true };
}

/**
 * What io's messages and findings name `page` by: a target-app page by its path, as the preview's
 * picker does, and any other page by its whole URL.
 */
export function nameOf(page: PageRef): string {
  return page.onTargetApp ? new URL(page.url).pathname : page.url;
}

/**
 * A `url=` query value: trimmed, parsed and spelled as `href`, so two spellings of one page share
 * one key, with its query and its hash kept, since a hash names another page on a hash-routed app.
 * What `new URL` cannot parse is refused with its own message, and the rest is core's `AxeUrl`, so
 * a `url=` and a stored scan's key share one definition: an `HttpUrl`, so no `file:` or `chrome:`,
 * which would open the machine's own files or the browser's pages, and no single-label host, and
 * no user or password, which have no place in a stored key.
 *
 * A URL on io's own host passes here. The middleware in `app.ts` refuses what io's Chromium sends
 * when it opens a page, `Sec-Fetch-Site: none` with `Sec-Fetch-Mode: navigate`, so io's Chromium
 * reaches io by no path: neither a `url=` naming io nor a page that redirects into it.
 */
export const pageUrlParam = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    try {
      return new URL(raw).href;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "url must be a whole URL, such as https://example.com/",
      });
      return z.NEVER;
    }
  })
  .pipe(AxeUrl);

/** A `page=` query value: one of the target app's paths. */
const pageParam = z.string().refine((path) => TARGET_APP_PATHS.includes(path), {
  message: `page must be one of the target app's pages: ${TARGET_APP_PATHS.join(", ")}`,
});

/** The `page` and `url` keys of a query, as `pageQuery`'s `keys` reads them. */
interface PageKeys {
  page?: string | undefined;
  url?: string | undefined;
}

/**
 * The page a `/measure` or `/axe` query names. `keys` are its `page` and `url` keys, each optional,
 * for the route's own strict query object, which may add keys of its own; a repeated key arrives
 * as an array and fails its schema. `pageRef`, its transform, reads them as one `PageRef`: `page`,
 * one of `TARGET_APP_PATHS`, is that page on `targetAppOrigin` at the app's default parameters,
 * and `url` is any page as `pageUrlParam` reads it. Both together are refused, and so is neither,
 * unless `defaultPage` names the target-app path it then is.
 */
export function pageQuery(targetAppOrigin: string, { defaultPage }: { defaultPage?: string } = {}) {
  return {
    keys: { page: pageParam.optional(), url: pageUrlParam.optional() },
    pageRef({ page, url }: PageKeys, ctx: z.RefinementCtx): PageRef {
      if (page !== undefined && url !== undefined) {
        ctx.addIssue({ code: "custom", message: "ask for a page or a url, not both" });
        return z.NEVER;
      }
      if (url !== undefined) return { url, onTargetApp: false };
      const path = page ?? defaultPage;
      if (path === undefined) {
        ctx.addIssue({ code: "custom", message: "ask for a page or a url" });
        return z.NEVER;
      }
      return targetAppPage(targetAppOrigin, path, TARGET_APP_DEFAULT_QUERY);
    },
  };
}
