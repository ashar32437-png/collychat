"use client";

import { useEffect, useRef, useState } from "react";
import { shrinkImage } from "@/lib/image-resize";
import { NOTE_TONES, createNote, loadNotes, newId, noteTitle, saveNotes } from "@/lib/notes";
import type { NoteImage, StickyNote } from "@/lib/notes";
import { MAX_ATTACHMENT_BYTES } from "@/lib/types";

export default function NotesTool() {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNotes(loadNotes());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveNotes(notes);
  }, [notes, loaded]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const open = notes.find((note) => note.id === openId) ?? null;

  function update(noteId: string, patch: Partial<StickyNote>) {
    setNotes((previous) =>
      previous.map((note) =>
        note.id === noteId ? { ...note, ...patch, updatedAt: Date.now() } : note
      )
    );
  }

  function addNote() {
    const note = createNote(notes.length);
    setNotes((previous) => [...previous, note]);
    setOpenId(note.id);
  }

  function removeNote(noteId: string) {
    setNotes((previous) => previous.filter((note) => note.id !== noteId));
    if (openId === noteId) setOpenId(null);
  }

  // ------------------------------------------------------------ board drag
  function startBoardDrag(event: React.PointerEvent, note: StickyNote) {
    if (event.button !== 0) return;
    const board = boardRef.current;
    if (!board) return;
    event.preventDefault();

    const rect = board.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - note.x;
    const offsetY = event.clientY - rect.top - note.y;
    let moved = false;

    const onMove = (moveEvent: PointerEvent) => {
      const bounds = board.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min(bounds.width - 190, moveEvent.clientX - bounds.left - offsetX)
      );
      const y = Math.max(0, Math.min(bounds.height - 80, moveEvent.clientY - bounds.top - offsetY));
      if (Math.abs(x - note.x) > 3 || Math.abs(y - note.y) > 3) moved = true;
      setNotes((previous) =>
        previous.map((item) =>
          item.id === note.id ? { ...item, x, y, updatedAt: Date.now() } : item
        )
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) setOpenId(note.id);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ------------------------------------------------------------ image drag
  function startImageDrag(event: React.PointerEvent, image: NoteImage) {
    if (event.button !== 0 || !open) return;
    const editor = editorRef.current;
    if (!editor) return;
    event.preventDefault();
    event.stopPropagation();

    const noteId = open.id;
    const rect = editor.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - (image.x / 100) * rect.width;
    const offsetY = event.clientY - rect.top - (image.y / 100) * rect.height;

    const onMove = (moveEvent: PointerEvent) => {
      const bounds = editor.getBoundingClientRect();
      const x = ((moveEvent.clientX - bounds.left - offsetX) / bounds.width) * 100;
      const y = ((moveEvent.clientY - bounds.top - offsetY) / bounds.height) * 100;
      setNotes((previous) =>
        previous.map((note) =>
          note.id === noteId
            ? {
                ...note,
                images: note.images.map((item) =>
                  item.id === image.id
                    ? {
                        ...item,
                        x: Math.max(-10, Math.min(92, x)),
                        y: Math.max(-10, Math.min(92, y)),
                      }
                    : item
                ),
                updatedAt: Date.now(),
              }
            : note
        )
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function addImage(url: string) {
    if (!open) return;
    const index = open.images.length;
    update(open.id, {
      images: [
        ...open.images,
        {
          id: newId(),
          url,
          x: 6 + (index % 3) * 16,
          y: 10 + (index % 3) * 20,
          width: 40,
        },
      ],
    });
  }

  async function uploadImage(raw: File) {
    if (!open) return;
    setBusy(true);
    setNotice(null);
    try {
      const file = await shrinkImage(raw, 1400);
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setNotice("Images must be under " + MAX_ATTACHMENT_BYTES / 1_000_000 + " MB");
        return;
      }
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/attachments", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(typeof data?.error === "string" ? data.error : "Upload failed");
        return;
      }
      addImage(data.url as string);
    } catch {
      setNotice("Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="relative h-full overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <button
          type="button"
          onClick={addNote}
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong"
        >
          + New note
        </button>
        <span className="text-xs text-faint">
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </span>
      </div>

      <div
        ref={boardRef}
        className="relative h-[calc(100%-3.25rem)] overflow-auto"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {notes.length === 0 && (
          <p className="absolute left-1/2 top-24 -translate-x-1/2 text-sm text-faint">
            No notes yet.
          </p>
        )}

        {notes.map((note) => (
          <div
            key={note.id}
            onPointerDown={(event) => startBoardDrag(event, note)}
            style={{ left: note.x, top: note.y, background: note.tone }}
            className="note-sticky group absolute w-[190px] cursor-grab select-none rounded-2xl p-3 transition-shadow hover:shadow-2xl active:cursor-grabbing"
          >
            <p className="truncate text-sm font-semibold text-ink">{noteTitle(note)}</p>
            {note.text && (
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                {note.text}
              </p>
            )}
            {note.images.length > 0 && (
              <div className="mt-2 flex gap-1">
                {note.images.slice(0, 3).map((image) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={image.id}
                    src={image.url}
                    alt=""
                    className="h-10 w-10 rounded-md object-cover ring-1 ring-white/10"
                  />
                ))}
                {note.images.length > 3 && (
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-black/30 text-[10px] text-muted">
                    +{note.images.length - 3}
                  </span>
                )}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-[10px] text-faint">
              <span>{note.images.length > 0 ? "🖼 " + note.images.length : "text"}</span>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => removeNote(note.id)}
                className="opacity-0 transition group-hover:opacity-100 hover:text-danger"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="glass fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div className="card-shadow flex h-[min(82vh,640px)] w-[min(94vw,860px)] flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-faint">
                Sticky note
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-raised hover:text-ink disabled:opacity-50"
              >
                {busy ? "Uploading…" : "Add image"}
              </button>
              <button
                type="button"
                onClick={() => setShowUrlInput((value) => !value)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-raised hover:text-ink"
              >
                Image URL
              </button>
              <button
                type="button"
                onClick={() => removeNote(open.id)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-danger/15 hover:text-danger"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-strong"
              >
                Done
              </button>
            </div>

            {showUrlInput && (
              <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                <input
                  autoFocus
                  value={urlDraft}
                  onChange={(event) => setUrlDraft(event.target.value)}
                  placeholder="https://… or /api/attachments/12"
                  className="flex-1 rounded-lg border border-line bg-base px-3 py-1.5 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = urlDraft.trim();
                    if (!/^(https?:\/\/|\/)/.test(value)) {
                      setNotice("That doesn't look like an image address");
                      return;
                    }
                    addImage(value);
                    setUrlDraft("");
                    setShowUrlInput(false);
                    setNotice(null);
                  }}
                  className="rounded-xl bg-raised px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-hover"
                >
                  Add
                </button>
              </div>
            )}

            {notice && (
              <p className="border-b border-line bg-danger/10 px-4 py-2 text-xs text-danger">
                {notice}
              </p>
            )}

            <div ref={editorRef} className="relative flex-1 overflow-hidden">
              <textarea
                autoFocus
                value={open.text}
                onChange={(event) => update(open.id, { text: event.target.value })}
                placeholder="Type your note… drag the images around, they always sit above the text."
                className="absolute inset-0 h-full w-full resize-none bg-transparent px-6 py-5 text-lg leading-relaxed text-ink outline-none placeholder:text-faint"
              />

              {/* image layer: always above the text */}
              <div className="pointer-events-none absolute inset-0 z-20">
                {open.images.map((image) => (
                  <div
                    key={image.id}
                    onPointerDown={(event) => startImageDrag(event, image)}
                    style={{ left: image.x + "%", top: image.y + "%", width: image.width + "%" }}
                    className="group pointer-events-auto absolute cursor-grab active:cursor-grabbing"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      draggable={false}
                      className="w-full rounded-xl border border-white/10 shadow-2xl"
                    />
                    <div className="absolute -right-2 -top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() =>
                          update(open.id, {
                            images: open.images.map((item) =>
                              item.id === image.id
                                ? { ...item, width: Math.max(15, item.width - 6) }
                                : item
                            ),
                          })
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-rail text-xs text-ink ring-1 ring-line-strong"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          update(open.id, {
                            images: open.images.map((item) =>
                              item.id === image.id
                                ? { ...item, width: Math.min(90, item.width + 6) }
                                : item
                            ),
                          })
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-rail text-xs text-ink ring-1 ring-line-strong"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          update(open.id, {
                            images: open.images.filter((item) => item.id !== image.id),
                          })
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-rail text-xs text-danger ring-1 ring-line-strong"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadImage(file);
            }}
          />
        </div>
      )}
    </div>
  );
}
