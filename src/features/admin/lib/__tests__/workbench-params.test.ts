import { describe, expect, it } from "vitest";
import {
  activeWorkbenchParams,
  countActiveFilters,
  splitAxis,
  toWorkbenchQuery,
  toggleAxis,
} from "../workbench-params";
import { WORKBENCH_PARAM_KEYS, adminSearchSchema, type AdminSearch } from "../search-schema";

/** Only the fields the params helpers read matter; the rest is URL chrome. */
function search(partial: Partial<AdminSearch>): AdminSearch {
  return partial as AdminSearch;
}

describe("splitAxis", () => {
  it("splits a comma list", () => {
    expect(splitAxis("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for undefined", () => {
    expect(splitAxis(undefined)).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    expect(splitAxis("")).toEqual([]);
  });

  it("drops empty segments from stray commas", () => {
    expect(splitAxis("a,,b,")).toEqual(["a", "b"]);
  });

  it("keeps a single value", () => {
    expect(splitAxis("solo")).toEqual(["solo"]);
  });
});

describe("toggleAxis", () => {
  it("adds an entry to an undefined axis", () => {
    expect(toggleAxis(undefined, "b2")).toBe("b2");
  });

  it("appends a new entry to an existing axis", () => {
    expect(toggleAxis("b1", "b2")).toBe("b1,b2");
  });

  it("removes an entry that is already present", () => {
    expect(toggleAxis("b1,b2,b3", "b2")).toBe("b1,b3");
  });

  it("returns undefined when removing the last entry", () => {
    expect(toggleAxis("b1", "b1")).toBeUndefined();
  });

  it("leaves a repeated add order intact", () => {
    expect(toggleAxis("b1,b2", "b3")).toBe("b1,b2,b3");
  });

  it("is its own inverse for a single add/remove", () => {
    const added = toggleAxis("b1", "b2");
    expect(toggleAxis(added, "b2")).toBe("b1");
  });
});

describe("toWorkbenchQuery", () => {
  it("maps an empty search to server defaults", () => {
    expect(toWorkbenchQuery(search({}))).toEqual({
      page: 0,
      pageSize: 50,
      search: "",
      minOpenReports: 0,
      sort: "word",
      dir: "asc",
    });
  });

  it("passes page and size through", () => {
    const query = toWorkbenchQuery(search({ page: 3, size: 100 }));
    expect(query.page).toBe(3);
    expect(query.pageSize).toBe(100);
  });

  it("maps q to search and reports to minOpenReports", () => {
    const query = toWorkbenchQuery(search({ q: " cafe ", reports: 4 }));
    expect(query.search).toBe(" cafe ");
    expect(query.minOpenReports).toBe(4);
  });

  it("passes sort and dir when present", () => {
    const query = toWorkbenchQuery(search({ sort: "reports", dir: "desc" }));
    expect(query.sort).toBe("reports");
    expect(query.dir).toBe("desc");
  });

  it("includes a level axis only when set", () => {
    expect(toWorkbenchQuery(search({ levels: "b1,b2" })).levels).toBe("b1,b2");
    expect("levels" in toWorkbenchQuery(search({}))).toBe(false);
  });

  it("includes topics, exams and statuses when set", () => {
    const query = toWorkbenchQuery(
      search({ topics: "work", exams: "toeic", statuses: "draft" }),
    );
    expect(query.topics).toBe("work");
    expect(query.exams).toBe("toeic");
    expect(query.statuses).toBe("draft");
  });

  it("renames drift to drifted", () => {
    expect(toWorkbenchQuery(search({ drift: "yes" })).drifted).toBe("yes");
  });

  it("omits drifted when drift is absent", () => {
    expect("drifted" in toWorkbenchQuery(search({}))).toBe(false);
  });

  it("defaults sort to word and dir to asc", () => {
    const query = toWorkbenchQuery(search({ q: "x" }));
    expect(query.sort).toBe("word");
    expect(query.dir).toBe("asc");
  });
});

describe("activeWorkbenchParams", () => {
  it("is empty for a blank search", () => {
    expect(activeWorkbenchParams(search({}))).toEqual({});
  });

  it("keeps only the set filter params", () => {
    const params = activeWorkbenchParams(search({ q: "cafe", levels: "b1", page: 5 }));
    expect(params).toEqual({ q: "cafe", levels: "b1" });
  });

  it("leaves out empty strings and nulls", () => {
    const params = activeWorkbenchParams(search({ q: "", topics: undefined }));
    expect("q" in params).toBe(false);
    expect("topics" in params).toBe(false);
  });

  it("stringifies a numeric reports value", () => {
    expect(activeWorkbenchParams(search({ reports: 3 })).reports).toBe("3");
  });

  it("captures every stored key when all are set", () => {
    const full = search({
      q: "x",
      levels: "b1",
      topics: "work",
      exams: "toeic",
      statuses: "draft",
      reports: 1,
      drift: "yes",
      sort: "word",
      dir: "asc",
      size: 50,
    });
    const params = activeWorkbenchParams(full);
    for (const key of WORKBENCH_PARAM_KEYS) {
      expect(params).toHaveProperty(key);
    }
  });

  it("never includes page (position is not a filter)", () => {
    expect("page" in activeWorkbenchParams(search({ page: 9 }))).toBe(false);
  });
});

describe("countActiveFilters", () => {
  it("is zero for a blank search", () => {
    expect(countActiveFilters(search({}))).toBe(0);
  });

  it("counts each level value", () => {
    expect(countActiveFilters(search({ levels: "b1,b2,c1" }))).toBe(3);
  });

  it("sums across all four axes", () => {
    const count = countActiveFilters(
      search({ levels: "b1", topics: "work,study", exams: "toeic", statuses: "draft" }),
    );
    expect(count).toBe(5);
  });

  it("counts a search term as one", () => {
    expect(countActiveFilters(search({ q: "cafe" }))).toBe(1);
  });

  it("does not count a zero reports floor", () => {
    expect(countActiveFilters(search({ reports: 0 }))).toBe(0);
  });

  it("counts a positive reports floor", () => {
    expect(countActiveFilters(search({ reports: 2 }))).toBe(1);
  });

  it("counts a drift toggle", () => {
    expect(countActiveFilters(search({ drift: "no" }))).toBe(1);
  });

  it("combines axes, search, reports and drift", () => {
    const count = countActiveFilters(
      search({ levels: "b1,b2", q: "x", reports: 1, drift: "yes" }),
    );
    expect(count).toBe(5);
  });
});

describe("adminSearchSchema", () => {
  it("applies defaults for range and app", () => {
    const parsed = adminSearchSchema.parse({});
    expect(parsed.range).toBe("30d");
    expect(parsed.app).toBe("kinetic-canvas");
  });

  it("accepts a valid workbench query", () => {
    const parsed = adminSearchSchema.parse({
      levels: "b1,b2",
      q: "cafe",
      reports: 3,
      drift: "yes",
      sort: "reports",
      dir: "desc",
    });
    expect(parsed.levels).toBe("b1,b2");
    expect(parsed.drift).toBe("yes");
  });

  it("coerces numeric page/size from strings", () => {
    const parsed = adminSearchSchema.parse({ page: "2", size: "60" });
    expect(parsed.page).toBe(2);
    expect(parsed.size).toBe(60);
  });

  it("rejects a page size below the minimum", () => {
    expect(() => adminSearchSchema.parse({ size: "5" })).toThrow();
  });

  it("rejects an unknown range preset", () => {
    expect(() => adminSearchSchema.parse({ range: "12h" })).toThrow();
  });

  it("rejects a negative reports floor", () => {
    expect(() => adminSearchSchema.parse({ reports: "-1" })).toThrow();
  });

  it("WORKBENCH_PARAM_KEYS is a frozen set of stored filters", () => {
    expect(WORKBENCH_PARAM_KEYS).toContain("levels");
    expect(WORKBENCH_PARAM_KEYS).not.toContain("page");
    expect(WORKBENCH_PARAM_KEYS).not.toContain("range");
  });
});
