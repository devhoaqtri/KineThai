/**
 * The reader-report cell of a workbench row.
 *
 * It names the most-cited reason inline rather than only counting complaints, because
 * "two readers say the meaning is wrong" is a different job from "two readers say the
 * Vietnamese reads oddly", and a reviewer should not have to open another page to tell
 * them apart.
 *
 * Exports: WorkbenchReportCell
 * Depends on: lucide-react, report reasons
 */

import { AlertTriangle } from "lucide-react";
import { getReportReason, isSevereReason } from "@/features/vocabulary/lib/word-report";

/**
 * Open-report badge plus the top reason.
 * @param props.openReports - how many open reports name this word
 * @param props.topReasons - the most-cited reasons, already ordered
 * @returns report cell UI
 */
export function WorkbenchReportCell({
  openReports,
  topReasons,
}: {
  openReports: number;
  topReasons: { id: string; count: number }[];
}): React.ReactElement {
  const label = (reason: { id: string; count: number }) =>
    getReportReason(reason.id)?.en ?? reason.id;

  return (
    <td className="px-2 py-2 text-center">
      {openReports > 0 ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-500"
          title={topReasons.map((reason) => `${label(reason)} ×${reason.count}`).join("\n")}
        >
          <AlertTriangle size={11} />
          {openReports}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground/50">—</span>
      )}
      {topReasons[0] && (
        <p
          className={`mt-0.5 max-w-[9rem] text-[10px] leading-tight ${
            // Severe reasons sort first, so a flagged word names its flag here.
            isSevereReason(topReasons[0].id)
              ? "font-semibold text-red-500"
              : "text-muted-foreground"
          }`}
        >
          {label(topReasons[0])}
        </p>
      )}
    </td>
  );
}
