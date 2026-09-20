import { inflateRawSync } from "node:zlib";

/**
 * Minimal single-purpose ZIP reader: returns the first entry's bytes as a
 * string. GDELT's 15-minute files are one-entry archives, and the sizes live
 * in the central directory (the local header may defer them via a data
 * descriptor), so we read from the central directory. No general-purpose zip
 * support is intended — this avoids adding a dependency.
 */
export function readFirstZipEntry(zip: Buffer): string {
  const EOCD_SIGNATURE = 0x06054b50;
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a zip archive (end-of-central-directory not found)");

  const centralOffset = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("corrupt zip central directory");

  const method = zip.readUInt16LE(centralOffset + 10);
  const compressedSize = zip.readUInt32LE(centralOffset + 20);
  const localOffset = zip.readUInt32LE(centralOffset + 42);

  if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("corrupt zip local header");
  const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
  const data = zip.subarray(dataStart, dataStart + compressedSize);

  if (method === 0) return data.toString("utf8");
  if (method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`unsupported zip compression method ${method}`);
}
