import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import type * as React from "react";

// The look is docs/design/components.css's `.wf-btn`: ink primary, outlined default, ghost. There is
// no focus ring of its own, so the base `:focus-visible` outline in index.css applies everywhere.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border label whitespace-nowrap cursor-pointer transition-colors active:translate-y-px disabled:pointer-events-none disabled:border-line disabled:bg-paper-sunken disabled:text-ink-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "border-ink bg-ink text-paper hover:border-ink-2 hover:bg-ink-2",
        outline: "border-line-strong bg-surface text-ink hover:bg-paper-sunken",
        ghost: "border-transparent bg-transparent text-ink-2 hover:bg-paper-sunken hover:text-ink",
      },
      // 40 px controls and 32 px targets, the floor (docs/DESIGN.md): both read their token.
      size: {
        default: "h-(--control-h) px-4",
        sm: "h-(--target-min) px-3",
        icon: "size-(--control-h)",
        "icon-sm": "size-(--target-min)",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/** A button in Wayford's three looks (ink, outline, ghost) and four sizes, none under 32 px. */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
