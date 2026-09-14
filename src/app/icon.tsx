import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const BLACKTOP = "#0C0C0E";
const CLEAN_SHEET = "#FFFFFF";

/** Favicon: white ES Cut mark on Blacktop, per blueprint section 4. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: BLACKTOP, display: "flex", position: "relative" }}>
        <div style={{ position: "absolute", left: 6, top: 3, width: 5, height: 26, background: CLEAN_SHEET }} />
        <div style={{ position: "absolute", left: 6, top: 3, width: 20, height: 5, background: CLEAN_SHEET }} />
        <div style={{ position: "absolute", left: 6, top: 13.5, width: 16, height: 5, background: CLEAN_SHEET }} />
        <div style={{ position: "absolute", left: 6, top: 24, width: 20, height: 5, background: CLEAN_SHEET }} />
      </div>
    ),
    { ...size },
  );
}
