/**
 * Editorial inspection and internal operations on editorial items (one per story cluster).
 *
 *   pnpm news:editorial                         # list the best-ranked items (--status= --limit=)
 *   pnpm news:editorial --show=<id>             # why is this ranked here? score parts, eligibility, overrides, audit
 *   pnpm news:editorial --preview=<id>          # internal Story preview + source panel (no bodies, no fake fields)
 *   pnpm news:editorial --approve=<id> --reason="…"   # ready for FUTURE publication (nothing is published)
 *   pnpm news:editorial --hold=<id> | --reject=<id> | --review=<id> | --release=<id>
 *   pnpm news:editorial --boost=<id>:60 | --suppress=<id>[:80] | --pin=<id> | --unpin=<id>
 *   pnpm news:editorial --force-section=<id>:wire | --force-priority=<id>:250
 *   pnpm news:editorial --clear=<id>[:<kind>]   # remove overrides (history is kept)
 *
 * <id> is an editorial item id or a cluster id. Every mutation is audited (editorial_events) and,
 * unless --no-rank is given, followed by a re-rank so its effect is visible. Mutations never
 * bypass eligibility: an override changes priority, not what is publishable.
 */
import { loadDotEnvFiles } from "@/lib/news/cli/load-env";
import { InvalidCliArgError } from "@/lib/news/cli/parse-args";
import { parseEditorialArgs } from "@/lib/news/editorial-ranking/cli";
import { getAudit, getItem, getStoryPreview, listItems, removeOverride, setOverride, setStatus } from "@/lib/news/editorial-ranking/queries";
import { formatItem, formatStoryPreview } from "@/lib/news/editorial-ranking/report";
import { runEditorialRanking } from "@/lib/news/editorial-ranking/run";
import { createWarehouseClient, WarehouseConfigError } from "@/lib/news/warehouse/client";
import type { EditorialStatus, OverrideKind } from "@/lib/news/editorial-ranking/types";

loadDotEnvFiles();

async function main() {
  const options = parseEditorialArgs(process.argv.slice(2));
  const client = createWarehouseClient();
  const { action } = options;
  const print = (value: unknown, text: string) => console.log(options.json ? JSON.stringify(value, null, 2) : text);

  const resolve = async (id: string) => {
    const item = await getItem(client, id);
    if (!item) throw new InvalidCliArgError(`No editorial item or cluster with id ${id} — run \`pnpm news:rank\` first`);
    return item;
  };

  if (action.type === "list") {
    const items = await listItems(client, { status: action.status ? [action.status as EditorialStatus] : undefined, limit: action.limit });
    return print(
      items,
      items.length
        ? items.map((i) => `${i.rankPosition ? `#${String(i.rankPosition).padStart(3)}` : "  - "}  ${i.score.toFixed(0).padStart(4)}  ${i.status.padEnd(9)} ${i.eligibility.padEnd(10)} ${i.urgency.padEnd(18)} ${i.sport.padEnd(10)} ${String(i.sourceCount).padStart(3)}src  ${(i.headline ?? "(no headline)").slice(0, 70)}\n        ${i.id}`).join("\n")
        : "No editorial items yet. Run `pnpm news:rank` first.",
    );
  }
  if (action.type === "show") {
    const item = await resolve(action.id);
    const audit = await getAudit(client, item.id);
    return print({ item, audit }, formatItem(item, { audit }));
  }
  if (action.type === "preview") {
    const item = await resolve(action.id);
    const preview = await getStoryPreview(client, item);
    return print(preview, formatStoryPreview(preview));
  }

  const item = await resolve(action.id);
  let summary: string;
  switch (action.type) {
    case "status": {
      const result = await setStatus(client, item.id, action.status, options.reason);
      summary = result.changed ? `${item.status} → ${action.status}` : `already ${action.status}`;
      break;
    }
    case "boost": summary = `boost +${action.amount} (override #${await setOverride(client, item.id, { kind: "boost", amount: action.amount, reason: options.reason })})`; break;
    case "suppress": summary = `suppress (override #${await setOverride(client, item.id, { kind: "suppress", amount: action.amount, reason: options.reason })})`; break;
    case "pin": summary = `pinned (override #${await setOverride(client, item.id, { kind: "pin", reason: options.reason })})`; break;
    case "unpin": summary = `unpinned (${await removeOverride(client, item.id, "pin", options.reason)} removed)`; break;
    case "force-section": summary = `force section ${action.section} (override #${await setOverride(client, item.id, { kind: "force_section", text: action.section, reason: options.reason })})`; break;
    case "force-priority": summary = `force priority ${action.score} (override #${await setOverride(client, item.id, { kind: "force_priority", amount: action.score, reason: options.reason })})`; break;
    case "clear-overrides": summary = `${await removeOverride(client, item.id, action.kind as OverrideKind | undefined, options.reason)} override(s) removed`; break;
  }
  if (options.rerank) await runEditorialRanking(client, { window: "48h", trigger: "manual" });
  const after = await getItem(client, item.id);
  print({ summary, item: after }, `${summary}\n\n${after ? formatItem(after, { audit: await getAudit(client, after.id) }) : ""}`);
}

main().catch((error) => {
  if (error instanceof InvalidCliArgError || error instanceof WarehouseConfigError) console.error(`news:editorial: ${error.message}`);
  else console.error(`news:editorial: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
