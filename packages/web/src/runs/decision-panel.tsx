/**
 * How Jev chose a step's action (`docs/adr/0001-jev-actor-backend.md`, decisions 3, 4 and 6): the
 * options in offer order, the probability it gave each, and where the run's seeded roll landed.
 * The drawn option is core's `drawOption`, the draw the run made, never worked out again here.
 *
 * Jev rounds each probability, so they need not sum to 1: a bar and a range are the option's
 * share of the total, the scale `drawOption` draws on, and the number printed is as stored.
 */
import { type DecisionRecord, drawOption } from "@wayford/core";
import { Detail, Details, NOTE, TABLE, TD, TH } from "./details.js";

/** Each option's range on the cumulative scale from 0 to 1, and the index of the drawn one. */
export function drawScale(decision: DecisionRecord): {
  ranges: { from: number; to: number }[];
  drawn: number;
} {
  const { probabilities, rolled } = decision;
  const total = probabilities.reduce((sum, p) => sum + p, 0);
  let running = 0;
  const ranges = probabilities.map((p) => {
    const from = running / total;
    running += p;
    return { from, to: running / total };
  });
  return { ranges, drawn: drawOption(probabilities, rolled) };
}

/** A point on the scale, to three places: `0.071`. */
function point(value: number): string {
  return String(Number(value.toFixed(3)));
}

export function DecisionPanel({ decision }: { decision: DecisionRecord }) {
  const { ranges, drawn } = drawScale(decision);
  return (
    <>
      <p className={NOTE}>
        Jev gave each option it was offered a probability. The action was drawn from them by the
        run's seed, not taken as the top pick.
      </p>
      <Details>
        <Detail term="Confidence">
          <span className="font-mono">{decision.confidence}</span> the model's: how sure Jev was,
          lower on a more ambiguous page, not how the persona felt
        </Detail>
        <Detail term="Rolled">
          <span className="font-mono">{decision.rolled}</span> on the cumulative scale from 0 to 1,
          which lands on option {drawn + 1}
        </Detail>
      </Details>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <caption className="pb-2 text-left text-xs text-muted-foreground">
            Every option offered, in the order offered. A bar is the option's share of the draw.
          </caption>
          <thead>
            <tr>
              {["Option", "p", "Share", "Range", "Drawn"].map((h) => (
                <th key={h} scope="col" className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decision.options.map(({ description }, i) => {
              const { from = 0, to = 0 } = ranges[i] ?? {};
              const isDrawn = i === drawn;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: the options keep the order offered, so the index is the option's identity
                <tr key={i} className={isDrawn ? "bg-muted/50 font-medium" : undefined}>
                  <td className={TD}>{description}</td>
                  <td className={`${TD} font-mono`}>{decision.probabilities[i]}</td>
                  <td className={`${TD} w-1/4`}>
                    <span
                      data-bar=""
                      aria-hidden="true"
                      className={`block h-2 rounded-sm ${isDrawn ? "bg-(--persona)" : "bg-muted-foreground/40"}`}
                      style={{ width: `${((to - from) * 100).toFixed(1)}%` }}
                    />
                  </td>
                  <td className={`${TD} font-mono whitespace-nowrap`}>
                    {`${point(from)} to ${point(to)}`}
                  </td>
                  {/* The roll is printed once, above: a stored one can run to 17 digits. */}
                  <td className={TD}>{isDrawn ? "drawn: the roll lands here" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
