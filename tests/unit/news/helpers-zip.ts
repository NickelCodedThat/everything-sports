import { deflateRawSync } from "node:zlib";

/** Builds a minimal one-entry ZIP (deflate) so GKG tests never touch the network. */
export function buildZip(name: string, content: string): Buffer {
  const data = Buffer.from(content, "utf8");
  const compressed = deflateRawSync(data);
  const nameBuffer = Buffer.from(name);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuffer.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuffer.length, 28);
  central.writeUInt32LE(0, 42);

  const localPart = Buffer.concat([local, nameBuffer, compressed]);
  const centralPart = Buffer.concat([central, nameBuffer]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);

  return Buffer.concat([localPart, centralPart, eocd]);
}

/** One GKG 2.1 row: only the columns the parser reads are meaningful. */
export function gkgRow(opts: { date: string; domain: string; url: string; title?: string; translated?: boolean }): string {
  const columns = new Array<string>(27).fill("");
  columns[1] = opts.date;
  columns[3] = opts.domain;
  columns[4] = opts.url;
  columns[25] = opts.translated ? "srclc:spa;eng:GT-ARA 1.0" : "";
  columns[26] = opts.title === undefined ? "" : `<PAGE_TITLE>${opts.title}</PAGE_TITLE>`;
  return columns.join("\t");
}
