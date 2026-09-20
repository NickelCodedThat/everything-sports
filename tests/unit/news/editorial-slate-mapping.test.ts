import { describe, expect, it } from "vitest";
import { buildSlate, type SlateItem } from "@/lib/news/editorial-ranking/slate";
import {
  toStoryPreview,
  orderSupportingSources,
  STORY_FIELD_MAP,
  type MappableItem,
  type SupportingSource,
} from "@/lib/news/editorial-ranking/story-mapping";
import { NOW } from "./editorial-helpers";

function item(n: number, over: Partial<SlateItem> = {}): SlateItem {
  return {
    itemId: `i${n}`,
    clusterId: `c${n}`,
    headline: `Report ${n}`,
    score: 300 - n,
    urgency: "normal",
    sport: "basketball",
    desk: "run",
    eventType: "injury",
    sourceCount: 3,
    eligibility: "eligible",
    status: "candidate",
    lead: true,
    wire: true,
    now: true,
    deskOk: true,
    entityKeys: [],
    latestAt: NOW,
    teams: [],
    forcedSection: null,
    pinned: false,
    ...over,
  };
}
const flatten = (slate: ReturnType<typeof buildSlate>) =>
  Object.values(slate.sections)
    .flat()
    .map((e) => e.item);

describe("slate uniqueness and editorial concentration", () => {
  it("one cluster appears once, even with duplicate input rows", () => {
    const result = flatten(
      buildSlate([
        item(1, { lead: false, pinned: true }),
        item(1, { lead: false, pinned: true }),
        item(2),
      ]),
    );
    expect(new Set(result.map((i) => i.clusterId)).size).toBe(result.length);
  });
  it.each(["held", "rejected", "published"] as const)(
    "excludes %s immediately",
    (status) => expect(flatten(buildSlate([item(1, { status })]))).toEqual([]),
  );
  it("excludes unsafe and headline-less items", () =>
    expect(
      flatten(
        buildSlate([
          item(1, { headline: null }),
          item(2, { eligibility: "ineligible" }),
        ]),
      ),
    ).toEqual([]));
  it("Lead consumes the strongest qualifying item before desks", () => {
    const s = buildSlate([item(1), item(2)]);
    expect(s.sections.lead[0].item.clusterId).toBe("c1");
    expect(s.sections.run.some((e) => e.item.clusterId === "c1")).toBe(false);
  });
  it("keeps quiet sections empty", () =>
    expect(flatten(buildSlate([]))).toEqual([]));
  it("applies the sport share cap only across sports sections", () => {
    const s = buildSlate(
      Array.from({ length: 10 }, (_, n) =>
        item(n, { lead: false, eventType: null }),
      ),
    );
    expect(s.sections.wire).toHaveLength(3);
    expect(s.sections.run).toHaveLength(7);
    expect(
      s.skipped.some((e) => e.reason.includes("sport concentration")),
    ).toBe(true);
  });
  it("applies event-type concentration across sports", () => {
    const sports = [
      "basketball",
      "football",
      "baseball",
      "soccer",
      "mma",
      "hockey",
    ];
    const s = buildSlate(
      sports.map((sport, n) => item(n, { sport, lead: false })),
    );
    expect(s.sections.wire).toHaveLength(3);
    expect(
      s.skipped.some((e) => e.reason.includes("event-type concentration")),
    ).toBe(true);
  });
  it("limits team concentration within a desk", () => {
    const s = buildSlate(
      Array.from({ length: 5 }, (_, n) =>
        item(n, { lead: false, wire: false, now: false, teams: ["herons"] }),
      ),
    );
    expect(s.sections.run).toHaveLength(2);
  });
  it("limits one team to three across the slate", () => {
    const s = buildSlate(
      Array.from({ length: 8 }, (_, n) => item(n, { teams: ["herons"] })),
    );
    expect(flatten(s)).toHaveLength(3);
  });
  it.each(["breaking-candidate", "developing"] as const)(
    "allows a dominant %s news moment",
    (urgency) => {
      const s = buildSlate(
        Array.from({ length: 6 }, (_, n) =>
          item(n, { lead: false, urgency, sourceCount: 6, teams: ["herons"] }),
        ),
      );
      expect(s.sections.wire).toHaveLength(6);
    },
  );
  it("suppresses probable split clusters but preserves different sports", () => {
    const s = buildSlate([
      item(1, { entityKeys: ["team:herons", "name:ruiz"] }),
      item(2, { entityKeys: ["team:herons", "name:ruiz"] }),
      item(3, { sport: "football", entityKeys: ["team:herons", "name:ruiz"] }),
    ]);
    expect(flatten(s).map((i) => i.clusterId)).toEqual(["c1", "c3"]);
  });
  it("does not suppress another event more than 24 hours apart", () => {
    const s = buildSlate([
      item(1, { entityKeys: ["team:a", "team:b"] }),
      item(2, {
        entityKeys: ["team:a", "team:b"],
        latestAt: new Date(NOW.getTime() - 25 * 3600000),
      }),
    ]);
    expect(flatten(s)).toHaveLength(2);
  });
  it("pins sort first and exempt duplicate guard", () => {
    const s = buildSlate([item(1), item(2, { score: 100, pinned: true })]);
    expect(s.sections.lead[0].item.clusterId).toBe("c2");
  });
  it("honors qualified forced section and ignores an unsafe force", () => {
    const s = buildSlate([
      item(1, { forcedSection: "run" }),
      item(2, { forcedSection: "lead", lead: false }),
    ]);
    expect(s.sections.run[0].item.clusterId).toBe("c1");
    expect(s.sections.lead).toEqual([]);
  });
  it("Now applies its score floor after desks", () => {
    const s = buildSlate([item(1, { score: 159 }), item(2, { score: 160 })], {
      depth: { lead: 0, wire: 0, run: 0 },
    });
    expect(s.sections.now.map((e) => e.item.clusterId)).toEqual(["c2"]);
  });
});

const mappable: MappableItem = {
  id: "i",
  clusterId: "c",
  headline: "Herons sign guard",
  status: "candidate",
  sport: "basketball",
  league: null,
  eventType: "signing",
  urgency: "breaking-candidate",
  sourceCount: 2,
  firstPublishedAt: null,
  lastPublishedAt: null,
  eligibility: "eligible",
  eligibilityReasons: [],
};
const source = (
  domain: string,
  over: Partial<SupportingSource> = {},
): SupportingSource => ({
  publisher: domain,
  domain,
  url: `https://${domain}/story`,
  publishedAt: null,
  headline: "Herons sign guard",
  isRepresentative: false,
  quality: "unknown",
  ...over,
});
describe("honest Story mapping", () => {
  it("omits unavailable fields instead of inventing content", () => {
    const preview = toStoryPreview(mappable, [])!;
    for (const field of [
      "deck",
      "byline",
      "image",
      "articleBody",
      "slug",
      "credibilityTier",
    ])
      expect(preview).not.toHaveProperty(field);
    expect(preview).toMatchObject({
      attribution: null,
      publishedAt: null,
      updatedAt: null,
      imageStatus: "missing",
      readyForPublication: false,
      storyUrgency: "developing",
      breakingCandidate: true,
    });
    expect(Object.keys(STORY_FIELD_MAP)).toContain("byline");
  });
  it.each([
    { headline: null },
    { headline: " " },
    { eligibility: "ineligible" },
    { status: "held" },
    { status: "rejected" },
  ])("refuses unsafe preview %j", (change) =>
    expect(
      toStoryPreview({ ...mappable, ...change } as MappableItem, []),
    ).toBeNull(),
  );
  it("approval alone marks a safe preview ready", () =>
    expect(
      toStoryPreview({ ...mappable, status: "approved" }, [])
        ?.readyForPublication,
    ).toBe(true));
  it("orders representative, quality, earliest report and domain without mutating input", () => {
    const sources = [
      source("z.example"),
      source("a.example"),
      source("known.example", { quality: "known" }),
      source("rep.example", { isRepresentative: true, quality: "low-quality" }),
      source("early.example", { quality: "known", publishedAt: NOW }),
    ];
    expect(orderSupportingSources(sources).map((s) => s.domain)).toEqual([
      "rep.example",
      "early.example",
      "known.example",
      "a.example",
      "z.example",
    ]);
    expect(sources[0].domain).toBe("z.example");
    expect(toStoryPreview(mappable, sources)?.attribution?.domain).toBe(
      "rep.example",
    );
  });
});
