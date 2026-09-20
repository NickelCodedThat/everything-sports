import { expect, it } from "vitest";
import { readPages } from "@/lib/news/editorial-ranking/paging";
it("reads beyond a server page and preserves order", async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => i);
  expect(
    await readPages(
      async (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
      "test",
    ),
  ).toEqual(rows);
});
it("honors an explicit capacity", async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => i);
  expect(
    await readPages(
      async (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
      "test",
      751,
    ),
  ).toEqual(rows.slice(0, 751));
});
it("fails rather than silently accepting a partial second page", async () => {
  await expect(
    readPages(
      async (from) =>
        from === 0
          ? { data: Array(500).fill(1), error: null }
          : { data: null, error: { message: "offline" } },
      "test",
    ),
  ).rejects.toThrow("test: offline");
});
