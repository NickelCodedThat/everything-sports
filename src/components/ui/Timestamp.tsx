import { formatRelativeTime } from "@/lib/utils/format-time";

export function Timestamp({ iso, className = "" }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} className={`tabular-nums ${className}`}>
      {formatRelativeTime(iso)}
    </time>
  );
}
