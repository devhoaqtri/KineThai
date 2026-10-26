import { describe, expect, it } from "vitest";
import {
  EMPTY_QUERY,
  countFacets,
  filterRows,
  pageOf,
  sortRows,
  type WorkbenchQuery,
  type WorkbenchRow,
} from "../workbench-filter";

type RowOverrides = Partial<Omit<WorkbenchRow, "id">> & { id?: string };

function makeRow(overrides: RowOverrides = {}): WorkbenchRow {
  const base: WorkbenchRow = {
    id: "w1",
    word: "alpha",
    defVi: "",
    leadVi: "",
    anticipateVi: "",
    pos: "noun",
    ipa: "",
    level: "A1",
    topics: ["daily"],
    exams: ["toeic"],
    emphasis: [],
    usage: [],
    status: "draft",
    updatedAt: "2026-01-01T00:00:00.000Z",
    reviewedAt: null,
    reviewNote: "",
    openReports: 0,
    topReasons: [],
    published: false,
    drifted: false,
  };
  return { ...base, ...overrides };
}

function query(partial: Partial<WorkbenchQuery>): WorkbenchQuery {
  return { ...EMPTY_QUERY, ...partial };
}

describe("EMPTY_QUERY", () => {
  it("is a neutral, unfiltered first page", () => {
    expect(EMPTY_QUERY.search).toBe("");
    expect(EMPTY_QUERY.levels).toEqual([]);
    expect(EMPTY_QUERY.minOpenReports).toBe(0);
    expect(EMPTY_QUERY.drifted).toBeNull();
    expect(EMPTY_QUERY.sort).toBe("word");
    expect(EMPTY_QUERY.dir).toBe("asc");
    expect(EMPTY_QUERY.page).toBe(0);
    expect(EMPTY_QUERY.pageSize).toBe(50);
  });
});

describe("filterRows — search", () => {
  const rows = [
    makeRow({ id: "1", word: "cafe", defVi: "quán nước" }),
    makeRow({ id: "2", word: "beach", leadVi: "bãi biển" }),
    makeRow({ id: "7", word: "desk" }),
  ];

  it("keeps everything on an empty search", () => {
    expect(filterRows(rows, query({}))).toHaveLength(3);
  });

  it("matches the headword case-insensitively", () => {
    expect(filterRows(rows, query({ search: "CAFE" })).map((r) => r.id)).toEqual(["1"]);
  });

  it("matches a definition field", () => {
    expect(filterRows(rows, query({ search: "quán" })).map((r) => r.id)).toEqual(["1"]);
  });

  it("matches a lead field", () => {
    expect(filterRows(rows, query({ search: "biển" })).map((r) => r.id)).toEqual(["2"]);
  });

  it("matches on the row id", () => {
    expect(filterRows(rows, query({ search: "7" })).map((r) => r.id)).toEqual(["7"]);
  });

  it("returns nothing when no field matches", () => {
    expect(filterRows(rows, query({ search: "zzz" }))).toEqual([]);
  });
});

describe("filterRows — axes", () => {
  const rows = [
    makeRow({ id: "1", word: "a", level: "B2", topics: ["work"], exams: ["toeic"], status: "approved" }),
    makeRow({ id: "2", word: "b", level: "C1", topics: ["study"], exams: ["ielts"], status: "draft" }),
    makeRow({ id: "3", word: "c", level: "B2", topics: ["daily"], exams: ["gre"], status: "needs-review" }),
  ];

  it("ORs values inside one axis", () => {
    const ids = filterRows(rows, query({ levels: ["B2", "C1"] })).map((r) => r.id);
    expect(ids).toEqual(["1", "2", "3"]);
  });

  it("ANDs across different axes", () => {
    const ids = filterRows(rows, query({ levels: ["B2"], topics: ["work"] })).map((r) => r.id);
    expect(ids).toEqual(["1"]);
  });

  it("drops rows whose level is null when an axis is applied", () => {
    const withNull = [...rows, makeRow({ id: "4", word: "d", level: null })];
    const ids = filterRows(withNull, query({ levels: ["B2"] })).map((r) => r.id);
    expect(ids).toEqual(["1", "3"]);
  });

  it("matches an exam inside the axis", () => {
    const ids = filterRows(rows, query({ exams: ["ielts", "gre"] })).map((r) => r.id);
    expect(ids).toEqual(["2", "3"]);
  });

  it("matches on status", () => {
    const ids = filterRows(rows, query({ statuses: ["draft"] })).map((r) => r.id);
    expect(ids).toEqual(["2"]);
  });

  it("skips the requested axis (used for facet counting)", () => {
    const ids = filterRows(rows, query({ levels: ["C1"] }), "levels").map((r) => r.id);
    // The level axis is ignored, so every row survives.
    expect(ids).toEqual(["1", "2", "3"]);
  });
});

describe("filterRows — derived", () => {
  const rows = [
    makeRow({ id: "1", word: "a", openReports: 0 }),
    makeRow({ id: "2", word: "b", openReports: 3 }),
    makeRow({ id: "3", word: "c", openReports: 5, drifted: true }),
  ];

  it("keeps rows at or above the open-report floor", () => {
    const ids = filterRows(rows, query({ minOpenReports: 3 })).map((r) => r.id);
    expect(ids).toEqual(["2", "3"]);
  });

  it("filters to drifted rows only", () => {
    const ids = filterRows(rows, query({ drifted: true })).map((r) => r.id);
    expect(ids).toEqual(["3"]);
  });

  it("filters to in-sync rows only", () => {
    const ids = filterRows(rows, query({ drifted: false })).map((r) => r.id);
    expect(ids).toEqual(["1", "2"]);
  });

  it("combines derived and axis filters", () => {
    const withLevel = [
      makeRow({ id: "1", word: "a", level: "B2", openReports: 5 }),
      makeRow({ id: "2", word: "b", level: "C1", openReports: 5 }),
    ];
    const ids = filterRows(withLevel, query({ levels: ["B2"], minOpenReports: 3 })).map(
      (r) => r.id,
    );
    expect(ids).toEqual(["1"]);
  });
});

describe("countFacets", () => {
  const rows = [
    makeRow({ id: "1", word: "a", level: "B2", topics: ["work"], exams: ["toeic"], status: "approved" }),
    makeRow({ id: "2", word: "b", level: "B2", topics: ["work", "study"], exams: ["ielts"], status: "draft" }),
    makeRow({ id: "3", word: "c", level: "C1", topics: ["daily"], exams: [], status: "draft" }),
  ];

  it("returns all four axes", () => {
    const facets = countFacets(rows, query({}));
    expect(Object.keys(facets).sort()).toEqual(["exams", "levels", "statuses", "topics"]);
  });

  it("tallies levels across the whole set", () => {
    expect(countFacets(rows, query({})).levels).toEqual({ B2: 2, C1: 1 });
  });

  it("tallies multi-valued topics once each", () => {
    expect(countFacets(rows, query({})).topics).toEqual({ work: 2, study: 1, daily: 1 });
  });

  it("ignores the levels axis's own selection when counting levels", () => {
    // Selecting C1 should not hide the B2 facet count.
    const facets = countFacets(rows, query({ levels: ["C1"] }));
    expect(facets.levels).toEqual({ B2: 2, C1: 1 });
  });

  it("applies other axes when counting a facet", () => {
    const facets = countFacets(rows, query({ levels: ["B2"] }));
    // Only B2 rows feed the topic/exam/status facets.
    expect(facets.topics).toEqual({ work: 2, study: 1 });
    expect(facets.statuses).toEqual({ approved: 1, draft: 1 });
  });

  it("omits null levels from the facet tally", () => {
    const withNull = [makeRow({ id: "9", word: "z", level: null })];
    expect(countFacets(withNull, query({})).levels).toEqual({});
  });
});

describe("sortRows", () => {
  it("sorts by word ascending", () => {
    const rows = [makeRow({ id: "1", word: "banana" }), makeRow({ id: "2", word: "apple" })];
    expect(sortRows(rows, "word", "asc").map((r) => r.word)).toEqual(["apple", "banana"]);
  });

  it("reverses for descending", () => {
    const rows = [makeRow({ id: "1", word: "banana" }), makeRow({ id: "2", word: "apple" })];
    expect(sortRows(rows, "word", "desc").map((r) => r.word)).toEqual(["banana", "apple"]);
  });

  it("breaks ties on id for a stable order", () => {
    const rows = [
      makeRow({ id: "b2", word: "same" }),
      makeRow({ id: "a1", word: "same" }),
    ];
    expect(sortRows(rows, "word", "asc").map((r) => r.id)).toEqual(["a1", "b2"]);
  });

  it("orders by level, unlevelled last", () => {
    const rows = [
      makeRow({ id: "1", word: "z", level: null }),
      makeRow({ id: "2", word: "y", level: "C1" }),
      makeRow({ id: "3", word: "x", level: "A1" }),
    ];
    expect(sortRows(rows, "level", "asc").map((r) => r.level)).toEqual(["A1", "C1", null]);
  });

  it("orders by updated timestamp", () => {
    const rows = [
      makeRow({ id: "1", word: "a", updatedAt: "2026-03-01T00:00:00.000Z" }),
      makeRow({ id: "2", word: "b", updatedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(sortRows(rows, "updated", "asc").map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("orders by pipeline status (draft before approved)", () => {
    const rows = [
      makeRow({ id: "1", word: "a", status: "approved" }),
      makeRow({ id: "2", word: "b", status: "draft" }),
      makeRow({ id: "3", word: "c", status: "needs-review" }),
    ];
    expect(sortRows(rows, "status", "asc").map((r) => r.status)).toEqual([
      "draft",
      "needs-review",
      "approved",
    ]);
  });

  it("places a severe report last ascending and first descending", () => {
    const rows = [
      makeRow({ id: "1", word: "a", openReports: 9, topReasons: [{ id: "typo", count: 9 }] }),
      makeRow({ id: "2", word: "b", openReports: 1, topReasons: [{ id: "sensitive", count: 1 }] }),
    ];
    // compare = nonSevere - severe, so ascending puts the severe row last and
    // the admin's descending view floats it to the top of the queue.
    expect(sortRows(rows, "reports", "asc").map((r) => r.id)).toEqual(["1", "2"]);
    expect(sortRows(rows, "reports", "desc").map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("orders ordinary reports by open-report count", () => {
    const rows = [
      makeRow({ id: "1", word: "a", openReports: 2, topReasons: [{ id: "typo", count: 2 }] }),
      makeRow({ id: "2", word: "b", openReports: 5, topReasons: [{ id: "wrong", count: 5 }] }),
    ];
    expect(sortRows(rows, "reports", "asc").map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("does not mutate the input array", () => {
    const rows = [makeRow({ id: "1", word: "b" }), makeRow({ id: "2", word: "a" })];
    const snapshot = rows.map((r) => r.id);
    sortRows(rows, "word", "asc");
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });
});

describe("pageOf", () => {
  const rows = Array.from({ length: 10 }, (_, i) => i);

  it("slices the first page", () => {
    const { slice, page, pageCount } = pageOf(rows, 0, 4);
    expect(slice).toEqual([0, 1, 2, 3]);
    expect(page).toBe(0);
    expect(pageCount).toBe(3);
  });

  it("slices a middle page", () => {
    expect(pageOf(rows, 1, 4).slice).toEqual([4, 5, 6, 7]);
  });

  it("clamps an overflowing page to the last one", () => {
    const { slice, page } = pageOf(rows, 99, 4);
    expect(page).toBe(2);
    expect(slice).toEqual([8, 9]);
  });

  it("clamps a negative page to zero", () => {
    const { slice, page } = pageOf(rows, -3, 4);
    expect(page).toBe(0);
    expect(slice).toEqual([0, 1, 2, 3]);
  });

  it("treats a non-positive page size as one", () => {
    expect(pageOf(rows, 0, 0).slice).toEqual([0]);
  });

  it("reports one page for an empty result set", () => {
    const { slice, page, pageCount } = pageOf<number>([], 5, 10);
    expect(slice).toEqual([]);
    expect(page).toBe(0);
    expect(pageCount).toBe(1);
  });

  it("splits exactly at the boundary", () => {
    expect(pageOf(rows, 1, 5).pageCount).toBe(2);
    expect(pageOf(rows, 1, 5).slice).toEqual([5, 6, 7, 8, 9]);
  });
});
