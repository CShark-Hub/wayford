/**
 * A run's files, served safely. The Actor loop stores each file's path relative to the run's own
 * folder, `<runsDir>/<runId>/`, with `/` separators (s2-03). A stored path is data read back from
 * the database, so a route resolves it through `runFilePath` before it opens anything.
 */
import { isAbsolute, relative, resolve, sep } from "node:path";
import { RunId } from "@wayford/core";

/**
 * `stored` resolved against `<runsDir>/<runId>/`, or `undefined` when it lands outside that folder
 * (`..`, absolute) or `runId` is no `RunId`. The folder itself is no file to serve, so it is
 * `undefined` too. A path counts where it lands, not how it is written: an absolute path into the
 * folder is served. This is the only check between a stored path and the bytes a route sends, and
 * it is stricter than "under the runs directory": another run's files are outside as well.
 */
export function runFilePath(runsDir: string, runId: string, stored: string): string | undefined {
  // Checked here, not by each route: a `RunId` is one path segment, so the folder sits directly in
  // `runsDir`.
  if (!RunId.safeParse(runId).success) return undefined;
  const folder = resolve(runsDir, runId);
  const path = resolve(folder, stored);
  const fromFolder = relative(folder, path);
  // `""` is the folder itself. `relative` answers with an absolute path when there is no relative
  // one, as from one Windows drive to another.
  const outside =
    fromFolder === ".." || fromFolder.startsWith(`..${sep}`) || isAbsolute(fromFolder);
  return fromFolder === "" || outside ? undefined : path;
}

/**
 * `attachment` with an ASCII `filename` (accents stripped, any other non-ASCII as `_`) and an RFC
 * 5987 `filename*`: a `Content-Disposition` value. Node refuses header text beyond Latin-1 and
 * HTTP leaves any byte beyond ASCII opaque (RFC 9110), while the persona label in a file name may
 * hold any Unicode letter, as in `zoë-seed1-…`. A browser saves the file under `filename*`, the
 * name as it is; `filename` is for a client that reads only that (RFC 6266).
 */
export function attachment(fileName: string): string {
  // `"` and `\` are replaced after NFKD, which turns their fullwidth forms into them. With neither
  // left, the quoted string needs no escapes.
  const ascii = fileName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7e]|["\\]/gu, "_");
  // RFC 5987's attr-char leaves out `'`, `(`, `)` and `*`, which `encodeURIComponent` keeps.
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
