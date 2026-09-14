import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BLACKTOP = "#0C0C0E";
const BURNT_SIGNAL = "#BC482E";

/** App icon: Blacktop field, Burnt Signal ES Cut stamp, no text. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: BLACKTOP,
        display: "flex",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 32,
          width: 22,
          height: 116,
          background: BURNT_SIGNAL,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 32,
          width: 56,
          height: 22,
          background: BURNT_SIGNAL,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 79,
          width: 62,
          height: 22,
          background: BURNT_SIGNAL,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 126,
          width: 56,
          height: 22,
          background: BURNT_SIGNAL,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 32,
          width: 90,
          height: 22,
          background: BURNT_SIGNAL,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 32,
          width: 22,
          height: 69,
          background: BURNT_SIGNAL,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 138,
          top: 79,
          width: 22,
          height: 69,
          background: BURNT_SIGNAL,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 126,
          width: 90,
          height: 22,
          background: BURNT_SIGNAL,
        }}
      />
    </div>,
    { ...size },
  );
}
