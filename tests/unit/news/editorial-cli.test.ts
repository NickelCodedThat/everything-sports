import { expect, it } from "vitest";
import {
  parseRankArgs,
  parseSlateArgs,
  parseEditorialArgs,
} from "@/lib/news/editorial-ranking/cli";

it("parses ranking and slate flags", () => {
  expect(
    parseRankArgs([
      "--window=48h",
      "--sport=football",
      "--top=10",
      "--json",
      "--dry-run",
      "--explain",
    ]),
  ).toEqual({
    window: "48h",
    sport: "football",
    top: 10,
    json: true,
    dryRun: true,
    explain: true,
  });
  expect(
    parseSlateArgs(["--refresh", "--window=3d", "--json", "--explain"]),
  ).toEqual({ refresh: true, window: "3d", json: true, explain: true });
});
it.each([
  "--top=0",
  "--top=NaN",
  "--sport=invalid",
  "--window=invalid",
  "--unknown",
])("rejects invalid ranking argument %s", (arg) =>
  expect(() => parseRankArgs([arg])).toThrow(),
);
it("parses an audited editor mutation", () =>
  expect(
    parseEditorialArgs([
      "--boost=item:75",
      "--reason=editor judgment",
      "--no-rank",
    ]),
  ).toEqual({
    action: { type: "boost", id: "item", amount: 75 },
    reason: "editor judgment",
    json: false,
    rerank: false,
  }));
it("refuses two mutations in one invocation", () =>
  expect(() => parseEditorialArgs(["--pin=a", "--reject=b"])).toThrow(
    /one action/,
  ));
it.each([
  "--approve=",
  "--force-section=a:invalid",
  "--boost=a:0",
  "--force-priority=a:NaN",
  "--unknown",
  "--limit=-1",
  "--limit=Infinity",
  "--status=bad",
  "--boost=a:301",
  "--suppress=a:NaN",
  "--force-priority=a:-1",
  "--clear=a:bad",
])("rejects invalid editor argument %s", (arg) =>
  expect(() => parseEditorialArgs([arg])).toThrow(),
);

it("parses status, force-section and override removal", () => {
  expect(parseEditorialArgs(["--hold=a"]).action).toEqual({
    type: "status",
    id: "a",
    status: "held",
  });
  expect(parseEditorialArgs(["--force-section=a:run"]).action).toEqual({
    type: "force-section",
    id: "a",
    section: "run",
  });
  expect(parseEditorialArgs(["--clear=a:boost"]).action).toEqual({
    type: "clear-overrides",
    id: "a",
    kind: "boost",
  });
});
