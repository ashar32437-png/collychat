import type { PresenceStatus } from "@/lib/types";

// Deliberately no purples — the UI accent is plain white.
export const AVATAR_TONES = [
  "#4f545c",
  "#2f7fd4",
  "#3ba55d",
  "#faa61a",
  "#ed4245",
  "#00a8fc",
  "#64748b",
  "#1abc9c",
  "#e67e22",
  "#e11d48",
];

export function toneFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "?";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

export function Avatar({
  name,
  url = null,
  size = 32,
  active = false,
  status = "active",
  ringColor = "var(--color-panel)",
  square = false,
}: {
  name: string;
  url?: string | null;
  size?: number;
  active?: boolean;
  status?: PresenceStatus;
  ringColor?: string;
  square?: boolean;
}) {
  const dot = Math.max(10, Math.round(size * 0.34));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={
          "flex h-full w-full items-center justify-center overflow-hidden font-semibold text-white " +
          (square ? "rounded-2xl" : "rounded-full")
        }
        style={{
          background: url ? "var(--color-elevated)" : toneFor(name),
          fontSize: Math.round(size * 0.4),
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(name)
        )}
      </div>
      {active && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full"
          style={{
            width: dot,
            height: dot,
            background: status === "dnd" ? "var(--color-warn)" : "var(--color-online)",
            border: "3px solid " + ringColor,
          }}
        />
      )}
    </div>
  );
}
