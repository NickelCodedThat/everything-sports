/**
 * Internal front-page slate — what a homepage COULD show, built from real ranked editorial items.
 * Not connected to the public homepage, which still reads fixtures.
 *
 *   pnpm news:slate                 # slate from the latest ranking run
 *   pnpm news:slate --refresh       # rank first, then build the slate
 *   pnpm news:slate --explain --json
 */
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { InvalidCliArgError } from "@/lib/news/cli/parse-args";
import { parseSlateArgs } from "@/lib/news/editorial-ranking/cli";
import { getSlate } from "@/lib/news/editorial-ranking/queries";
import { formatSlate } from "@/lib/news/editorial-ranking/report";
import { runEditorialRanking } from "@/lib/news/editorial-ranking/run";
import { SECTION_ORDER } from "@/lib/news/editorial-ranking/slate";
import { createWarehouseClient, WarehouseConfigError } from "@/lib/news/warehouse/client";

loadDotEnvFiles();

async function main() {
  const options = parseSlateArgs(process.argv.slice(2));
  const client = createWarehouseClient();
  if (options.refresh) {
    const report = await runEditorialRanking(client, { window: options.window, trigger: "manual" });
    if (report.status !== "succeeded") throw new Error(`slate refresh ${report.status}: ${report.errors.join("; ")}`);
  }
  const { slate, items } = await getSlate(client);
  if (options.json) {
    const sections = Object.fromEntries(
      SECTION_ORDER.map((id) => [
        id,
        slate.sections[id].map((e) => ({ position: e.position, itemId: e.item.itemId, clusterId: e.item.clusterId, headline: e.item.headline, score: e.item.score, urgency: e.item.urgency, sport: e.item.sport, sources: e.item.sourceCount, eventType: e.item.eventType, pinned: e.item.pinned })),
      ]),
    );
    console.log(JSON.stringify({ sections, skipped: slate.skipped, diversity: slate.diversity, depth: slate.depth }, null, 2));
  } else console.log(formatSlate(slate, items, { explain: options.explain }));
}

main().catch((error) => {
  if (error instanceof InvalidCliArgError || error instanceof WarehouseConfigError) console.error(`news:slate: ${error.message}`);
  else {
    console.error("news:slate: unexpected failure");
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
});
