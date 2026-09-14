import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BLACKTOP = "#0C0C0E";
const BURNT_SIGNAL = "#BC482E";

/** App icon: Blacktop field, Burnt Signal mark, no text, per blueprint section 4. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: BLACKTOP, display: "flex", position: "relative" }}>
        <div style={{ position: "absolute", left: 34, top: 17, width: 28, height: 146, background: BURNT_SIGNAL }} />
        <div style={{ position: "absolute", left: 34, top: 17, width: 112, height: 28, background: BURNT_SIGNAL }} />
        <div style={{ position: "absolute", left: 34, top: 76, width: 90, height: 28, background: BURNT_SIGNAL }} />
        <div style={{ position: "absolute", left: 34, top: 135, width: 112, height: 28, background: BURNT_SIGNAL }} />
      </div>
    ),
    { ...size },
  );
}
