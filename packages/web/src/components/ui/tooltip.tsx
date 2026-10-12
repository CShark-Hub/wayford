/**
 * Hints (#240): shadcn's Tooltip on Radix, drawn from the tokens: `surface`, a hairline and
 * `shadow-pop`, which `docs/DESIGN.md` keeps for popovers. No arrow, and none of shadcn's
 * animations: DESIGN's Motion allows colour and opacity alone, and an exit animation would keep a
 * closed hint mounted.
 *
 * Two kinds, `Hint` and `LinkHint` (#264), share the open-state rules (`useHintOpen`), the bubble
 * (`Bubble`) and the hover rest (`REST`).
 */
import { Info } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button } from "./button.js";

/**
 * A face's button: the 32 px box around a flag about 26 px tall, its margins giving the row back
 * the 6 px, so the row is as high as with the bare flag. The flag takes the hover ground.
 */
const FACE = "-my-0.75 min-w-(--target-min) px-0 hover:bg-transparent hover:*:bg-paper-sunken";

/**
 * How long the pointer rests on a trigger before its hint opens on hover; focus opens it at once.
 * Hints sit among links: an Info button under a number's link, a seed cell under the row above. A
 * pointer that passes over one on its way to a link opens nothing, so no bubble lands on the link
 * and takes its click. With no skip delay, a trigger the pointer comes back to waits in full too.
 */
const REST = { delayDuration: 300, skipDelayDuration: 0 } as const;

/**
 * A hint's open state. Radix closes on any scroll, the one Tab makes to bring the trigger into view
 * included, and when the pointer leaves, so while `held()` is true a close Radix asks for is
 * dropped unless Esc asked for it (WCAG 2.2, 1.4.13). A blur still closes it, since the trigger then
 * holds it no more. Another hint opening closes it, held or not.
 */
function useHintOpen(held: () => boolean) {
  const [open, setOpen] = useState(false);
  const escaped = useRef(false);

  // Another hint opening closes this one, even one focus holds: one hint at a time. Radix sends
  // every open tooltip `tooltip.open` on the document as another opens (react-tooltip 1.2), and a
  // click on a `Hint` sends it too, as an open of its own does not go through Radix.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("tooltip.open", close);
    return () => document.removeEventListener("tooltip.open", close);
  }, [open]);

  return {
    open,
    setOpen,
    onOpenChange: (next: boolean) => {
      if (!next && held() && !escaped.current) return;
      escaped.current = false;
      setOpen(next);
    },
    onEscapeKeyDown: () => {
      escaped.current = true;
    },
  };
}

/**
 * The bubble a hint shows while open. It never grows wider than Popper leaves inside the collision
 * padding, so it reflows on a 320 px screen.
 */
function Bubble({
  onEscapeKeyDown,
  children,
}: {
  onEscapeKeyDown: () => void;
  children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={4}
        collisionPadding={16}
        onEscapeKeyDown={onEscapeKeyDown}
        className="z-(--z-overlay) max-w-[min(20rem,var(--radix-tooltip-content-available-width))] rounded-sm border border-line bg-surface px-(--space-3) py-(--space-2) body text-pretty text-ink shadow-pop"
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/**
 * An Info button named `label`, and `hint` beside it while open. The button is described by the
 * hint at all times, through a `hidden` span: Radix names the bubble only while it is open, and a
 * screen reader cursor that does not move focus never opens it.
 *
 * `face`, when given, is drawn in place of the Info icon: a thing that explains itself, such as a
 * provenance tag (#243). `label` must then hold the face's words, so a voice command naming them
 * reaches the button (WCAG 2.2, 2.5.3).
 *
 * Radix opens on hover and focus but never on a tap, since it closes on pointerdown and on click,
 * so the hint holds its own state (`useHintOpen`):
 * - A tap toggles it from where the press began: a tap on Chromium focuses the button after
 *   pointerup, which opens the hint before the click arrives. A click from the keyboard, a mouse or
 *   a pen only opens it, since focus or hover has opened it already, and the button must not close
 *   what it explains.
 * - While the button has focus or a primary mouse or pen press is on it, only Esc closes it, and
 *   another hint opening, so the close Radix asks for on the press itself is dropped too. The press
 *   ends at its pointerup or pointercancel.
 */
export function Hint({ label, hint, face }: { label: string; hint: string; face?: ReactNode }) {
  /** The last press on the button: whether the hint was open as it began, and its pointer. */
  const press = useRef({ open: false, pointer: "" });
  const pressing = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  const { open, setOpen, onOpenChange, onEscapeKeyDown } = useHintOpen(
    () => pressing.current || document.activeElement === button.current,
  );

  return (
    <TooltipPrimitive.Provider {...REST}>
      <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <TooltipPrimitive.Trigger asChild>
          <Button
            ref={button}
            type="button"
            variant="ghost"
            size={face === undefined ? "icon-sm" : "sm"}
            className={face === undefined ? undefined : FACE}
            aria-label={label}
            aria-describedby={descriptionId}
            onPointerDown={(event) => {
              press.current = { open, pointer: event.pointerType };
              if (event.pointerType === "touch" || event.button !== 0) return;
              pressing.current = true;
              // A press can end with no pointerup: a pen that starts to pan sends pointercancel.
              const release = () => {
                pressing.current = false;
                document.removeEventListener("pointerup", release);
                document.removeEventListener("pointercancel", release);
              };
              document.addEventListener("pointerup", release);
              document.addEventListener("pointercancel", release);
            }}
            onClick={(event) => {
              // Radix skips its own close on click when the default is prevented, so this alone
              // decides. A click from the keyboard has no press before it, and `detail` 0.
              event.preventDefault();
              const next =
                event.detail === 0 || press.current.pointer !== "touch" || !press.current.open;
              if (next && !open) document.dispatchEvent(new CustomEvent("tooltip.open"));
              setOpen(next);
            }}
          >
            {face ?? <Info aria-hidden="true" className="size-5" strokeWidth={1.75} />}
          </Button>
        </TooltipPrimitive.Trigger>
        <Bubble onEscapeKeyDown={onEscapeKeyDown}>{hint}</Bubble>
      </TooltipPrimitive.Root>
      <span hidden id={descriptionId}>
        {hint}
      </span>
    </TooltipPrimitive.Provider>
  );
}

/**
 * `children`, one link, named by `label` and showing `bubble`, the same words as a node, while
 * open (#264). `children` forwards its ref and spreads its props, as TanStack's `Link` does, and
 * carries no name or title of its own: the Trigger puts `label` on it.
 *
 * - It opens on hover after the rest (`REST`), and on keyboard focus at once. Each link has its own
 *   Provider, so each waits in full.
 * - While the link has keyboard focus (`:focus-visible`), only Esc closes it, and another hint
 *   opening (`useHintOpen`). The focus a Ctrl+click or a right click leaves holds nothing: Radix
 *   opens nothing on a pointer's focus, and a bubble a later hover opens closes as the pointer
 *   leaves, as on a link with no focus.
 * - A press closes a bubble hover opened. The click, a tap or Enter then follows the link: nothing
 *   here handles them.
 * - The words are the link's name, so they are not also its description: the Trigger's
 *   `aria-describedby`, which Radix points at the bubble while open, is set to none.
 */
export function LinkHint({
  label,
  bubble,
  children,
}: {
  label: string;
  bubble: ReactNode;
  children: ReactElement;
}) {
  // The ref type Radix's Trigger takes. It holds the link.
  const link = useRef<HTMLButtonElement>(null);
  const { open, onOpenChange, onEscapeKeyDown } = useHintOpen(
    () => link.current?.matches(":focus-visible") ?? false,
  );

  return (
    <TooltipPrimitive.Provider {...REST}>
      <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <TooltipPrimitive.Trigger
          asChild
          ref={link}
          aria-label={label}
          aria-describedby={undefined}
        >
          {children}
        </TooltipPrimitive.Trigger>
        <Bubble onEscapeKeyDown={onEscapeKeyDown}>{bubble}</Bubble>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
