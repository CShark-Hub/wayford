/**
 * A hint (#240): shadcn's Tooltip on Radix, drawn from the tokens: `surface`, a hairline and
 * `shadow-pop`, which `docs/DESIGN.md` keeps for popovers. No arrow, and none of shadcn's
 * animations: DESIGN's Motion allows colour and opacity alone, and an exit animation would keep a
 * closed hint mounted.
 */
import { Info } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./button.js";

/**
 * An Info button named `label`, and `hint` beside it while open. The button is described by the
 * hint at all times, through a `hidden` span: Radix names the bubble only while it is open, and a
 * screen reader cursor that does not move focus never opens it.
 *
 * Radix opens on hover and focus but never on a tap, since it closes on pointerdown and on click,
 * so the hint holds its own state:
 * - A tap toggles it from where the press began: a tap on Chromium focuses the button after
 *   pointerup, which opens the hint before the click arrives. A click from the keyboard, a mouse or
 *   a pen only opens it, since focus or hover has opened it already, and the button must not close
 *   what it explains.
 * - While the button has focus or a primary mouse or pen press is on it, only Esc closes it, and
 *   another hint opening. The press ends at its pointerup or pointercancel. Radix also closes on the press itself, on any scroll, the one Tab makes to bring
 *   the button into view included, and when the pointer leaves. A blur still closes it.
 * - The bubble never grows wider than Popper leaves inside the collision padding, so it reflows on
 *   a 320 px screen.
 */
export function Hint({ label, hint }: { label: string; hint: string }) {
  const [open, setOpen] = useState(false);
  /** The last press on the button: whether the hint was open as it began, and its pointer. */
  const press = useRef({ open: false, pointer: "" });
  const pressing = useRef(false);
  const escaped = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();

  // Another hint opening closes this one, even one focus holds: one hint at a time. Radix sends
  // every open tooltip `tooltip.open` on the document as another opens (react-tooltip 1.2), and a
  // click below sends it too, as an open of its own does not go through Radix.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("tooltip.open", close);
    return () => document.removeEventListener("tooltip.open", close);
  }, [open]);

  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          // While blurring, the button is no longer the active element, so that close goes through.
          const held = pressing.current || document.activeElement === button.current;
          if (!next && held && !escaped.current) return;
          escaped.current = false;
          setOpen(next);
        }}
      >
        <TooltipPrimitive.Trigger asChild>
          <Button
            ref={button}
            type="button"
            variant="ghost"
            size="icon-sm"
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
            <Info aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </Button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={4}
            collisionPadding={16}
            onEscapeKeyDown={() => {
              escaped.current = true;
            }}
            className="z-(--z-overlay) max-w-[min(20rem,var(--radix-tooltip-content-available-width))] rounded-sm border border-line bg-surface px-(--space-3) py-(--space-2) body text-pretty text-ink shadow-pop"
          >
            {hint}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
      <span hidden id={descriptionId}>
        {hint}
      </span>
    </TooltipPrimitive.Provider>
  );
}
