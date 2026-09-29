"use client";

import { useEffect, useRef, useState } from "react";

function formatClock(ms: number): { main: string; centis: string } {
  const total = Math.max(0, ms);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  const core =
    (hours > 0 ? hours + ":" + String(minutes).padStart(2, "0") : String(minutes)) +
    ":" +
    String(seconds).padStart(2, "0");
  return { main: core, centis: String(hundredths).padStart(2, "0") };
}

function beep(times = 3) {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const context = new Ctor();
    for (let index = 0; index < times; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.28;
      oscillator.type = "sine";
      oscillator.frequency.value = index === times - 1 ? 1180 : 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.26);
    }
    window.setTimeout(() => void context.close(), times * 320 + 400);
  } catch {
    /* audio is a bonus, never a blocker */
  }
}

const PRESETS = [60, 300, 600, 1500];

export default function TimerTool() {
  const [mode, setMode] = useState<"stopwatch" | "timer">("stopwatch");

  // stopwatch
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const startedAtRef = useRef(0);

  // timer
  const [target, setTarget] = useState(300_000);
  const [remaining, setRemaining] = useState(300_000);
  const [timerRunning, setTimerRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const endsAtRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setElapsed(performance.now() - startedAtRef.current);
    }, 47);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      const left = endsAtRef.current - Date.now();
      if (left <= 0) {
        setRemaining(0);
        setTimerRunning(false);
        setFinished(true);
        beep();
        return;
      }
      setRemaining(left);
    }, 100);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  function toggleStopwatch() {
    if (running) {
      setElapsed(performance.now() - startedAtRef.current);
      setRunning(false);
      return;
    }
    startedAtRef.current = performance.now() - elapsed;
    setRunning(true);
  }

  function resetStopwatch() {
    setRunning(false);
    setElapsed(0);
    setLaps([]);
  }

  function startTimer(ms: number) {
    const total = Math.max(1000, ms);
    setFinished(false);
    setTarget(total);
    setRemaining(total);
    endsAtRef.current = Date.now() + total;
    setTimerRunning(true);
  }

  function pauseTimer() {
    setRemaining(Math.max(0, endsAtRef.current - Date.now()));
    setTimerRunning(false);
  }

  function resumeTimer() {
    if (remaining <= 0) return;
    setFinished(false);
    endsAtRef.current = Date.now() + remaining;
    setTimerRunning(true);
  }

  function resetTimer() {
    setTimerRunning(false);
    setFinished(false);
    setRemaining(target);
  }

  function extendTimer(minutes: number) {
    const extra = minutes * 60_000;
    if (timerRunning) {
      endsAtRef.current += extra;
      setRemaining(endsAtRef.current - Date.now());
      setTarget((value) => value + extra);
      return;
    }
    setTarget((value) => value + extra);
    setRemaining((value) => value + extra);
  }

  const stopwatchClock = formatClock(elapsed);
  const timerClock = formatClock(remaining);
  const progress = target > 0 ? 1 - Math.min(1, remaining / target) : 0;
  const lastLap = laps[0] ?? 0;

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex gap-1 rounded-lg border border-line bg-surface p-1">
          {(["stopwatch", "timer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={
                "flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition " +
                (mode === value ? "bg-raised text-ink" : "text-muted hover:text-ink")
              }
            >
              {value === "stopwatch" ? "Stopwatch" : "Timer"}
            </button>
          ))}
        </div>

        {mode === "stopwatch" ? (
          <div className="card-shadow rounded-2xl border border-line bg-surface p-8">
            <div className="flex items-end justify-center gap-1 font-mono">
              <span className="text-7xl font-light tracking-tight text-ink">
                {stopwatchClock.main}
              </span>
              <span className="pb-2 text-3xl text-muted">.{stopwatchClock.centis}</span>
            </div>

            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleStopwatch}
                className={
                  "rounded-lg px-7 py-3.5 text-[15px] font-semibold transition " +
                  (running
                    ? "bg-danger/15 text-danger hover:bg-danger/25"
                    : "bg-accent text-on-accent hover:bg-accent-strong")
                }
              >
                {running ? "Stop" : elapsed > 0 ? "Resume" : "Start"}
              </button>
              <button
                type="button"
                onClick={() => setLaps((previous) => [elapsed, ...previous].slice(0, 50))}
                disabled={elapsed === 0}
                className="rounded-lg border border-line px-5 py-3.5 text-[15px] font-medium text-muted transition hover:bg-raised hover:text-ink disabled:opacity-40"
              >
                Lap
              </button>
              <button
                type="button"
                onClick={resetStopwatch}
                disabled={elapsed === 0}
                className="rounded-lg border border-line px-5 py-3.5 text-[15px] font-medium text-muted transition hover:bg-raised hover:text-ink disabled:opacity-40"
              >
                Reset
              </button>
            </div>

            {laps.length > 0 && (
              <div className="mt-6 max-h-52 space-y-1 overflow-y-auto">
                {laps.map((lap, index) => {
                  const previous = laps[index + 1] ?? 0;
                  return (
                    <div
                      key={laps.length - index}
                      className="flex items-center justify-between rounded-xl bg-base/50 px-3 py-2 font-mono text-sm"
                    >
                      <span className="text-faint">Lap {laps.length - index}</span>
                      <span className="text-muted">+{formatClock(lap - previous).main}.{formatClock(lap - previous).centis}</span>
                      <span className="text-ink">{formatClock(lap).main}.{formatClock(lap).centis}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {laps.length > 0 && (
              <p className="mt-2 text-center text-xs text-faint">
                Last lap +{formatClock(elapsed - lastLap).main}.{formatClock(elapsed - lastLap).centis}
              </p>
            )}
          </div>
        ) : (
          <div className="card-shadow rounded-2xl border border-line bg-surface p-8">
            <div className={"text-center font-mono " + (finished ? "pulse-soft" : "")}>
              <span
                className={
                  "text-7xl font-light tracking-tight " + (finished ? "text-warn" : "text-ink")
                }
              >
                {timerClock.main}
              </span>
              <span className="text-3xl text-muted">.{timerClock.centis}</span>
            </div>

            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-base/60">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-100"
                style={{ width: Math.round(progress * 100) + "%" }}
              />
            </div>

            {finished && (
              <p className="mt-4 text-center text-sm font-medium text-warn">⏰ Time&apos;s up!</p>
            )}

            {!timerRunning && !finished && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => startTimer(preset)}
                    className="rounded-lg border border-line px-3.5 py-2.5 text-sm text-muted transition hover:bg-raised hover:text-ink"
                  >
                    {preset / 60} min
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-center gap-3">
              {timerRunning ? (
                <button
                  type="button"
                  onClick={pauseTimer}
                  className="rounded-lg bg-danger/15 px-7 py-3.5 text-[15px] font-semibold text-danger transition hover:bg-danger/25"
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => (remaining > 0 && remaining < target ? resumeTimer() : startTimer(remaining || target))}
                  className="rounded-lg bg-accent px-7 py-3.5 text-[15px] font-semibold text-on-accent transition hover:bg-accent-strong"
                >
                  {remaining > 0 && remaining < target ? "Resume" : "Start"}
                </button>
              )}
              <button
                type="button"
                onClick={() => extendTimer(1)}
                className="rounded-lg border border-line px-4 py-3.5 text-[15px] font-medium text-muted transition hover:bg-raised hover:text-ink"
              >
                +1 min
              </button>
              <button
                type="button"
                onClick={() => extendTimer(5)}
                className="rounded-lg border border-line px-4 py-3.5 text-[15px] font-medium text-muted transition hover:bg-raised hover:text-ink"
              >
                +5 min
              </button>
              <button
                type="button"
                onClick={resetTimer}
                className="rounded-lg border border-line px-4 py-3.5 text-[15px] font-medium text-muted transition hover:bg-raised hover:text-ink"
              >
                Reset
              </button>
            </div>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-faint">
              <span>Custom</span>
              <input
                type="number"
                min={1}
                max={180}
                defaultValue={5}
                onChange={(event) => {
                  const minutes = Number(event.target.value);
                  if (Number.isFinite(minutes) && minutes > 0) {
                    setTarget(minutes * 60_000);
                    setRemaining(minutes * 60_000);
                    setFinished(false);
                  }
                }}
                className="w-16 rounded-lg border border-line bg-base px-2 py-1 text-center text-ink outline-none focus:border-line-strong"
              />
              <span>minutes</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
