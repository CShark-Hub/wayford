import { cn } from "cn";
import { Archive, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A message above a screen, drawn as `.wf-banner`. `stored` is a status: dashed on the sunken
 * paper, for data that is not live. `fault` is an alert on the fault tint. One action slot.
 */
export function Banner({
  kind,
  children,
  action,
}: {
  kind: "stored" | "fault";
  children: ReactNode;
  action?: ReactNode;
}) {
  const stored = kind === "stored";
  const Icon = stored ? Archive : OctagonAlert;
  return (
    <div
      role={stored ? "status" : "alert"}
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border px-4 py-3",
        stored ? "border-dashed border-line-strong bg-paper-sunken" : "border-fault bg-fault-soft",
      )}
    >
      <Icon
        className={cn("size-5", !stored && "text-fault")}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {/* Breaks anywhere, so a message quoting a long URL keeps its column, and the action, in
          the window (#245). */}
      <p className="[overflow-wrap:anywhere]">{children}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
