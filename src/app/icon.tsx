import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const BLACKTOP = "#0C0C0E";
const CLEAN_SHEET = "#FFFFFF";

/** Favicon: white ES Cut stamp on Blacktop, per blueprint section 4. */
export default function Icon() {
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
          left: 3,
          top: 5,
          width: 4,
          height: 22,
          background: CLEAN_SHEET,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 3,
          top: 5,
          width: 10,
          height: 4,
          background: CLEAN_SHEET,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 3,
          top: 14,
          width: 11,
          height: 4,
          background: CLEAN_SHEET,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 3,
          top: 23,
          width: 10,
          height: 4,
          background: CLEAN_SHEET,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 5,
          width: 16,
          height: 4,
          background: CLEAN_SHEET,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 5,
          width: 4,
          height: 13,
          background: CLEAN_SHEET,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 24,
          top: 14,
          width: 4,
          height: 13,
          background: CLEAN_SHEET,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 23,
          width: 16,
          height: 4,
          background: CLEAN_SHEET,
        }}
      />
    </div>,
    { ...size },
  );
}
