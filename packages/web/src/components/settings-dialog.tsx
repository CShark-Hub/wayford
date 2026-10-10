/**
 * Settings, behind the gear in the top bar (`docs/DESIGN.md`, "Space, shape and layout"). For the
 * demo one thing is picked here: the Actor backend a race from the Race screen runs on
 * (`actor-backend.ts`). The OpenRouter key and each role's model are drawn too, disabled, each
 * naming its variable: io reads them from `.env` when it starts, and taking them in the app waits
 * until after the demo (`tasks/s3-19-settings-dialog.md`, "Later").
 */
import { LLM_ROLES, type LlmRole, type ReportBackend } from "@wayford/core";
import { Settings, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useId } from "react";
import { BACKEND_NAMES, pickBackend, useActorBackend } from "../actor-backend.js";
import { SegmentedControl } from "./segmented-control.js";
import { Button } from "./ui/button.js";

/** Each LLM role as the dialog names it. */
const ROLE_NAMES: Record<LlmRole, string> = {
  extractor: "Extractor",
  scout: "Scout",
  actor: "Actor",
  analyst: "Analyst",
};

const BACKENDS = (["llm", "jev"] as const).map((value) => ({ value, label: BACKEND_NAMES[value] }));

// The Race's seed field's look, drawn disabled: sunken, hairline, ink-3.
const FIELD =
  "h-(--control-h) w-full rounded-sm border border-line-strong bg-surface px-3 mono text-ink placeholder:text-ink-3 disabled:cursor-not-allowed disabled:border-line disabled:bg-paper-sunken disabled:text-ink-3";

/** One read-only field: its label, and the variable in `.env` that sets it, as its placeholder. */
function EnvField({
  id,
  label,
  variable,
  describedBy,
  secret,
}: {
  id: string;
  label: string;
  variable: string;
  describedBy: string;
  secret?: boolean;
}) {
  return (
    <>
      <label htmlFor={id} className="label text-ink-2">
        {label}
      </label>
      <input
        id={id}
        type={secret ? "password" : "text"}
        disabled
        autoComplete="off"
        placeholder={`${variable} in .env`}
        aria-describedby={describedBy}
        className={FIELD}
      />
    </>
  );
}

/**
 * The dialog's body, a view of its props alone: the backend switch, then the key and the models,
 * disabled, under the note that says where they come from.
 */
export function SettingsBody({
  backend,
  onBackendChange,
}: {
  backend: ReportBackend;
  onBackendChange: (backend: ReportBackend) => void;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className="flex flex-col gap-(--space-5)">
      <section aria-labelledby={`${id}-backend`} className="flex flex-col gap-(--space-2)">
        <h3 id={`${id}-backend`} className="label text-ink">
          Actor backend
        </h3>
        <div>
          <SegmentedControl
            label="Actor backend"
            options={BACKENDS}
            value={backend}
            onValueChange={onBackendChange}
          />
        </div>
        <p className="body text-pretty text-ink-2">
          Races started on the Race screen run on it. The Target screen stays on the LLM, since Jev
          cannot type.
        </p>
      </section>
      <section aria-labelledby={`${id}-env`} className="flex flex-col gap-(--space-3)">
        <h3 id={`${id}-env`} className="label text-ink">
          Key and models
        </h3>
        <p
          id={noteId}
          className="rounded-sm border border-line bg-paper-sunken p-(--space-3) body text-pretty text-ink-2"
        >
          For now io reads these from <code className="mono">.env</code> when it starts: change them
          there and restart io. Setting them here comes after the demo.
        </p>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-(--space-4) gap-y-(--space-2)">
          <EnvField
            id={`${id}-key`}
            label="OpenRouter API key"
            variable="LLM_API_KEY"
            describedBy={noteId}
            secret
          />
          {LLM_ROLES.map((role) => (
            <EnvField
              key={role}
              id={`${id}-${role}`}
              label={`${ROLE_NAMES[role]} model`}
              variable={`LLM_${role.toUpperCase()}_MODEL`}
              describedBy={noteId}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** The gear, a ghost icon button like the theme toggle, and the dialog it opens. */
export function SettingsDialog() {
  const backend = useActorBackend();
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Settings" title="Settings">
          <Settings aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-paper/75" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-(--z-overlay) flex max-h-[calc(100vh_-_var(--space-8))] w-[min(36rem,calc(100vw_-_var(--space-6)))] -translate-x-1/2 -translate-y-1/2 flex-col gap-(--space-5) overflow-y-auto rounded-md border border-line bg-surface p-(--space-6) shadow-pop"
        >
          <Dialog.Title className="title text-ink">Settings</Dialog.Title>
          <SettingsBody backend={backend} onBackendChange={pickBackend} />
          {/* Last in the markup, so the dialog opens with focus on the switch, the one control
              that works; drawn in the corner beside the title. */}
          <Dialog.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              title="Close"
              className="absolute top-(--space-5) right-(--space-5)"
            >
              <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
