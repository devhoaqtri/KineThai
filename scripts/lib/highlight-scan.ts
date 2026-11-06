/** Classify one Vietnamese clue field's highlight mark (docs/highlight-generation-rule.md). */
export const FIELDS = ["defVi", "leadVi", "anticipateVi"] as const;
export type Field = (typeof FIELDS)[number];

/** Marks that pass the two-syllable gate but light an empty phrase, not the point. */
export const FILLER_MARKS = new Set([
  "lần thử", "một chút", "chút xíu", "thứ gì", "việc gì", "lúc nào", "ai đó", "gì đó", "chỗ nào",
  "thế nào", "ở đâu", "người khác", "chỗ khác", "cái gì", "bao giờ", "điều gì", "một lần", "mỗi ngày",
  "cả lớp", "cả nhà", "mọi người", "mọi lúc", "nhiều lần",
]);
const BAD_FIRST = new Set([
  "đã", "đang", "sẽ", "rất", "không", "chưa", "bị", "được", "cũng", "mỗi", "cả", "mọi", "nhiều", "vài",
  "từng", "một", "hai", "ba", "bốn", "năm", "con", "cái", "chiếc", "cuốn", "tờ", "quả",
]);
const BAD_SECOND = new Set(["nhất", "hơn", "nào", "đâu", "gì", "khác", "ra", "lại", "xong", "đi"]);
const WHOLE_OK = new Set(["một mình", "không khí", "nhận ra", "xảy ra", "ngược lại", "còn lại", "ba lô", "duy nhất", "năm học", "con người", "cái đẹp"]);

export type Verdict = "ok" | "no-mark" | "one-syllable" | "too-long" | "two-marks" | "filler" | "weak-pair";

export function classifyField(text: string): Verdict {
  const marks = [...text.matchAll(/\/([^/]+)\//g)].map((m) => m[1].trim());
  if (marks.length === 0) return "no-mark";
  if (marks.length > 1) return "two-marks";
  const parts = marks[0].split(/[_=\s]+/).filter(Boolean);
  if (parts.length === 1) return "one-syllable";
  if (parts.length > 2 || !/^[^\s_=]+[_=][^\s_=]+$/.test(marks[0])) return "too-long";
  const pair = parts.join(" ").toLowerCase();
  if (FILLER_MARKS.has(pair)) return "filler";
  if (!WHOLE_OK.has(pair) && (BAD_FIRST.has(parts[0].toLowerCase()) || BAD_SECOND.has(parts[1].toLowerCase())))
    return "weak-pair";
  return "ok";
}
