import type { ReportBackend } from "@wayford/core";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { attributesOf, decode, lineOf } from "../preview/rendered-markup.js";
import { SettingsBody, SettingsDialog } from "./settings-dialog.js";

/** The body as the open dialog draws it, on `backend`. */
function body(backend: ReportBackend = "llm"): string {
  return renderToStaticMarkup(<SettingsBody backend={backend} onBackendChange={() => {}} />);
}

/** Every `<input>`: its attributes, and the text of the label that names it. */
function fieldsOf(html: string) {
  return [...html.matchAll(/<input([^>]*)>/g)].map((m) => {
    const attributes = attributesOf(m[1] ?? "");
    const label = html.match(
      new RegExp(`<label[^>]*for="${attributes.id}"[^>]*>(.*?)</label>`, "s"),
    );
    return { attributes, label: lineOf(label?.[1] ?? "") };
  });
}

/** The text of the element whose id is `id`. */
function textById(html: string, id: string): string {
  const element = html.match(new RegExp(`<(\\w+)[^>]*\\sid="${id}"[^>]*>(.*?)</\\1>`, "s"));
  return lineOf(element?.[2] ?? "");
}

test("the key and each role's model are drawn disabled, each naming its variable in .env", () => {
  const fields = fieldsOf(body());
  expect(fields.map(({ label, attributes }) => [label, attributes.placeholder])).toEqual([
    ["OpenRouter API key", "LLM_API_KEY in .env"],
    ["Extractor model", "LLM_EXTRACTOR_MODEL in .env"],
    ["Scout model", "LLM_SCOUT_MODEL in .env"],
    ["Actor model", "LLM_ACTOR_MODEL in .env"],
    ["Analyst model", "LLM_ANALYST_MODEL in .env"],
  ]);
  for (const { label, attributes } of fields) {
    expect(attributes, label).toHaveProperty("disabled");
  }
  // The key is a password field, so nothing typed or pasted there later is ever on screen.
  expect(fields[0]?.attributes.type).toBe("password");
});

test("every field is described by the note, which says the values come from .env", () => {
  const html = body();
  const notes = new Set(fieldsOf(html).map(({ attributes }) => attributes["aria-describedby"]));
  expect(notes.size).toBe(1);
  const note = textById(html, [...notes][0] ?? "");
  expect(note).toMatch(/from \.env when it starts/);
  expect(note).toMatch(/after the demo/);
});

test("the backend switch shows the pick, and the Target screen stays on the LLM", () => {
  for (const backend of ["llm", "jev"] as const) {
    const html = body(backend);
    const picked = [...html.matchAll(/<button[^>]*data-state="on"[^>]*>(.*?)<\/button>/gs)];
    expect(picked.map((m) => lineOf(m[1] ?? ""))).toEqual([backend === "llm" ? "LLM" : "Jev"]);
  }
  expect(lineOf(body())).toMatch(/The Target screen stays on the LLM/);
});

test("the dialog never says disabled", () => {
  const html = body();
  const said = [
    ...[...html.matchAll(/>([^<]+)</g)].map((m) => decode(m[1] ?? "")),
    ...[...html.matchAll(/\s(?:aria-label|title|placeholder)="([^"]*)"/g)].map((m) => m[1] ?? ""),
  ].join(" ");
  expect(said.toLowerCase()).not.toContain("disabled");
});

test("the gear is a 40 px ghost icon button named Settings that opens a dialog", () => {
  const html = renderToStaticMarkup(<SettingsDialog />);
  const button = attributesOf(html.match(/<button[^>]*>/)?.[0] ?? "");
  expect(button).toMatchObject({
    "aria-label": "Settings",
    "aria-haspopup": "dialog",
    "aria-expanded": "false",
    "data-variant": "ghost",
    "data-size": "icon",
  });
  expect(html).toContain("lucide-settings");
  expect(html).toMatch(/<svg[^>]* aria-hidden="true"/);
});
