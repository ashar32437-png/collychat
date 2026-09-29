"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { evaluateExpression, formatResult } from "@/lib/calc";

type HistoryEntry = { id: number; expression: string; result: string };

type Key =
  | { kind: "insert"; label: string; value: string; className?: string }
  | { kind: "action"; label: string; action: "clear" | "back" | "equals"; className?: string };

const SCI_KEYS: Key[] = [
  { kind: "insert", label: "√", value: "sqrt(" },
  { kind: "insert", label: "x²", value: "^2" },
  { kind: "insert", label: "xʸ", value: "^" },
  { kind: "insert", label: "π", value: "pi" },
];

const MAIN_KEYS: Key[] = [
  { kind: "action", label: "C", action: "clear" },
  { kind: "action", label: "⌫", action: "back" },
  { kind: "insert", label: "%", value: "%" },
  { kind: "insert", label: "÷", value: "/" },

  { kind: "insert", label: "7", value: "7" },
  { kind: "insert", label: "8", value: "8" },
  { kind: "insert", label: "9", value: "9" },
  { kind: "insert", label: "×", value: "*" },

  { kind: "insert", label: "4", value: "4" },
  { kind: "insert", label: "5", value: "5" },
  { kind: "insert", label: "6", value: "6" },
  { kind: "insert", label: "−", value: "-" },

  { kind: "insert", label: "1", value: "1" },
  { kind: "insert", label: "2", value: "2" },
  { kind: "insert", label: "3", value: "3" },
  { kind: "insert", label: "+", value: "+" },

  { kind: "insert", label: "(", value: "(" },
  { kind: "insert", label: ")", value: ")" },
  { kind: "insert", label: ".", value: "." },
  {
    kind: "action",
    label: "=",
    action: "equals",
    className: "bg-accent text-on-accent hover:bg-accent-strong",
  },
];

export default function Calculator({ active }: { active: boolean }) {
  const [expression, setExpression] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const idRef = useRef(1);
  const displayRef = useRef<HTMLDivElement | null>(null);

  const preview = useMemo(() => {
    if (!expression.trim()) return null;
    const result = evaluateExpression(expression);
    if (!result.ok) return null;
    const formatted = formatResult(result.value);
    return formatted === expression ? null : formatted;
  }, [expression]);

  const commit = useCallback(
    (raw: string) => {
      const result = evaluateExpression(raw);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const formatted = formatResult(result.value);
      setHistory((previous) => [
        { id: idRef.current++, expression: raw, result: formatted },
        ...previous,
      ].slice(0, 40));
      setExpression(formatted);
      setError(null);
    },
    []
  );

  const press = useCallback(
    (key: Key) => {
      if (key.kind === "insert") {
        setError(null);
        setExpression((value) => value + key.value);
        return;
      }
      if (key.action === "clear") {
        setExpression("");
        setError(null);
        return;
      }
      if (key.action === "back") {
        setError(null);
        setExpression((value) => value.slice(0, -1));
        return;
      }
      commit(expression);
    },
    [commit, expression]
  );

  // Keyboard support while the tool is on screen.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const key = event.key;
      if (/^[0-9.]$/.test(key)) {
        setError(null);
        setExpression((value) => value + key);
        return;
      }
      if (["+", "-", "*", "/", "^", "%", "(", ")"].includes(key)) {
        setError(null);
        setExpression((value) => value + key);
        return;
      }
      if (key === "Enter" || key === "=") {
        event.preventDefault();
        commit(expression);
        return;
      }
      if (key === "Backspace") {
        event.preventDefault();
        setError(null);
        setExpression((value) => value.slice(0, -1));
        return;
      }
      if (key === "Escape" || key.toLowerCase() === "c") {
        setExpression("");
        setError(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, commit, expression]);

  useEffect(() => {
    if (displayRef.current) displayRef.current.scrollLeft = displayRef.current.scrollWidth;
  }, [expression]);

  return (
    <div className="flex h-full items-center justify-center gap-10 overflow-y-auto p-6">
      <div className="w-full max-w-md">
        <div className="card-shadow rounded-2xl border border-line bg-surface p-5">
          <div className="rounded-xl bg-base/60 px-4 py-3.5">
            <div ref={displayRef} className="flex justify-end overflow-x-auto">
              <span className="whitespace-nowrap font-mono text-4xl font-light tracking-tight text-ink">
                {expression || "0"}
              </span>
            </div>
            <div className="mt-1.5 flex h-7 items-center justify-end">
              {error ? (
                <span className="text-sm text-danger">{error}</span>
              ) : preview ? (
                <span className="font-mono text-base text-accent-soft">= {preview}</span>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {SCI_KEYS.map((key) => (
              <button
                key={key.label}
                type="button"
                onClick={() => press(key)}
                className="h-10 rounded-lg border border-line bg-raised text-[15px] text-muted transition hover:bg-hover hover:text-ink"
              >
                {key.label}
              </button>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-2">
            {MAIN_KEYS.map((key) => (
              <button
                key={key.label}
                type="button"
                onClick={() => press(key)}
                className={
                  "h-16 rounded-lg text-xl font-medium transition active:scale-[0.97] " +
                  (key.className ??
                    (key.kind === "action"
                      ? "border border-line bg-raised text-muted hover:bg-hover hover:text-ink"
                      : "border border-line bg-raised text-ink hover:bg-hover"))
                }
              >
                {key.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden w-72 shrink-0 self-stretch lg:flex lg:flex-col lg:justify-center">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">History</p>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setHistory([])}
              className="text-xs text-faint transition hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
        <div className="space-y-1 overflow-y-auto">
          {history.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setExpression(entry.result.replace(/,/g, ""))}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-right transition hover:bg-raised"
              title="Use this result"
            >
              <span className="block truncate font-mono text-xs text-faint">{entry.expression}</span>
              <span className="block font-mono text-base text-ink">{entry.result}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
