"use client";

import { useState } from "react";

const MODES = {
  google: {
    label: "Google",
    frame: "https://www.google.com/webhp?igu=1",
    open: "https://www.google.com",
    embeds: true,
  },
  ai: {
    label: "AI Mode",
    frame: "https://gemini.google.com/app",
    open: "https://gemini.google.com/app",
    embeds: false,
  },
} as const;

type ModeKey = keyof typeof MODES;

export default function AiTool() {
  const [mode, setMode] = useState<ModeKey>("google");
  const [nonce, setNonce] = useState(0);
  const [hintOpen, setHintOpen] = useState(true);
  const current = MODES[mode];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <div className="flex gap-1 rounded-lg bg-surface p-1">
          {(Object.keys(MODES) as ModeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode(key);
                setHintOpen(true);
              }}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                (mode === key ? "bg-raised text-ink" : "text-muted hover:text-ink")
              }
            >
              {MODES[key].label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setNonce((value) => value + 1)}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-raised hover:text-ink"
        >
          Reload
        </button>
        <a
          href={current.open}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-strong"
        >
          Open in a new tab ↗
        </a>
      </div>

      <div className="relative flex-1 bg-white">
        <iframe
          key={mode + ":" + nonce}
          src={current.frame}
          title={current.label}
          className="h-full w-full border-0"
          referrerPolicy="no-referrer"
          allow="clipboard-write; microphone"
        />

        {!current.embeds && hintOpen && (
          <div className="pointer-events-none absolute inset-x-0 top-5 z-10 flex justify-center px-4">
            <div className="card-shadow pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl border border-line-strong bg-rail/95 p-3.5 backdrop-blur">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Gemini won&apos;t load in a frame</p>
                <div className="mt-2.5 flex gap-2">
                  <a
                    href={current.open}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-strong"
                  >
                    Open Gemini ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => setHintOpen(false)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-raised hover:text-ink"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
