"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes } from "./avatar";
import { shrinkImage } from "@/lib/image-resize";
import { MAX_ATTACHMENT_BYTES } from "@/lib/types";
import type { Attachment } from "@/lib/types";

const EMOJIS =
  "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😋 😛 😜 🤪 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😴 😪 😔 😕 😟 🙁 😮 😯 😲 😳 🥺 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖 😺 🙈 🙉 🙊 💋 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💞 💓 💗 💖 💘 💝 👍 👎 👌 ✌️ 🤞 🤟 🤘 👏 🙌 👐 🙏 💪 ✊ 👊 🤛 🤜 👋 🤚 ✋ 🖖 🤙 👀 🧠 👶 🧒 👦 👧 🧑 👨 🧔 👩 🧓 👴 👵 🙋 🤦 🤷 👮 🕵️ 💂 👷 🤴 👸 🎅 🤶 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 💆 💇 🚶 🏃 💃 🕺 👯 🧖 🤺 🏇 🏂 🏌️ 🏄 🚣 🏊 🏋️ 🚴 🚵 🤸 🤽 🤾 🤹 🧘 🛌 👭 👫 👬 💏 💑 👪 🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦅 🦉 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🐙 🦑 🦀 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🐪 🐫 🦒 🐄 🐖 🐏 🐑 🐐 🦌 🐕 🐩 🐈 🐓 🦃 🦜 🐇 🐁 🐀 🦔 🐾 🐉 🌵 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍄 💐 🌷 🌹 🌺 🌸 🌼 🌻 🌞 🌝 🌙 🌎 🌍 🌏 💫 ⭐ 🌟 ✨ ⚡ 💥 🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ⛄ 💨 💧 💦 ☔ 🌊 🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🌶️ 🥒 🥬 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🧀 🥚 🍳 🥞 🧇 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥙 🍜 🍝 🍣 🍱 🍛 🍚 🍤 🍢 🍡 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🥛 ☕ 🍵 🍺 🍻 🥂 🍷 🥃 🍸 🍹 ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥅 🏒 🏑 🥊 🥋 🎽 🛹 🛷 ⛸️ 🥌 🎿 ⛳ 🎯 🎳 🎮 🕹️ 🎲 🧩 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📷 📸 📹 🎥 📞 ☎️ 📟 📠 📺 📻 ⏰ ⌚ ⏳ 🔋 🔌 💡 🔦 🕯️ 🧯 💸 💵 💰 💳 💎 ⚖️ 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧲 💣 🧨 🛡️ 🔑 🗝️ 🚪 🛋️ 🛏️ 🚽 🚿 🛁 🧴 🧷 🧹 🧺 🧻 🧼 🪒 🧽 ⚔️ 🏆 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🎭 🎩 👑 🎓 📚 📖 📝 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗃️ 🗂️ 📁 📂 📅 📆 🗑️ 📇 🗒️ 📋 📈 📉 📊 📕 📗 📘 📙 📓 📔 📒 ✏️ 🖊️ 🖋️ 🖌️ 🖍️ 🔍 🔎 🔏 🔐 🔒 🔓".split(
    " "
  );

type GifResult = { id: string; title: string; preview: string; gif: string };

/** Big screenshots and phone photos get resized before they leave the browser. */
const MAX_IMAGE_EDGE = 1600;

export type ComposerPayload = {
  body: string;
  attachmentId: number | null;
  /** the same attachment, whole, so the optimistic bubble can draw it */
  attachment: Attachment | null;
  gifUrl: string | null;
};

export default function Composer({
  placeholder,
  onSend,
  disabled,
}: {
  placeholder: string;
  onSend: (payload: ComposerPayload) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"root" | "emoji" | "gif">("root");
  const [pending, setPending] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [gifState, setGifState] = useState<"idle" | "loading" | "needsKey" | "error">("idle");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = Math.min(element.scrollHeight, 180) + "px";
  }, [draft]);

  useEffect(() => {
    if (panel !== "gif") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setGifState("loading");
      try {
        const res = await fetch("/api/giphy?q=" + encodeURIComponent(gifQuery), {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.needsKey) {
          setGifState("needsKey");
          setGifs([]);
          return;
        }
        setGifs(Array.isArray(data.results) ? data.results : []);
        setGifState(data.error ? "error" : "idle");
      } catch {
        if (!cancelled) setGifState("error");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [panel, gifQuery]);

  function closeMenu() {
    setOpen(false);
    setPanel("root");
  }

  async function uploadFile(raw: File) {
    setUploading(true);
    setNotice(null);
    try {
      const file = await shrinkImage(raw, MAX_IMAGE_EDGE);
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setNotice("Files must be under " + MAX_ATTACHMENT_BYTES / 1_000_000 + " MB");
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
      setPending(data as Attachment);
    } catch {
      setNotice("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /**
   * The box empties itself straight away and the network is left to catch up.
   * Waiting for the round trip here is what made fast typing feel sticky: the
   * next message could not even be typed until the last one had been stored.
   * `onSend` hands the message to the outbox, so by the time it answers we have
   * already moved on; it only returns false when the message could not be
   * queued at all, and then the words go back into the box.
   */
  function send() {
    const text = draft.trim();
    const attachment = pending;
    if ((!text && !attachment) || disabled) return;
    const payload: ComposerPayload = {
      body: text,
      attachmentId: attachment ? attachment.id : null,
      attachment,
      gifUrl: null,
    };
    setDraft("");
    setPending(null);
    setNotice(null);
    void onSend(payload).then((queued) => {
      if (queued) return;
      setDraft((current) => (current ? current : text));
      setPending((current) => current ?? attachment);
    });
  }

  function sendGif(result: GifResult) {
    closeMenu();
    void onSend({
      body: "",
      attachmentId: null,
      // Shown immediately; the server swaps in the real attachment row.
      attachment: {
        id: 0,
        filename: "giphy.gif",
        contentType: "image/gif",
        sizeBytes: 0,
        url: result.gif,
        isImage: true,
        remoteUrl: result.gif,
      },
      gifUrl: result.gif,
    });
  }

  return (
    <div className="shrink-0 px-4 pb-4 pt-1">
      {notice && <p className="mb-2 text-sm text-danger">{notice}</p>}
      <div className="relative flex items-end gap-2 rounded-lg border border-line bg-raised px-3 py-2.5 transition focus-within:border-line-strong">
        <button
          type="button"
          onClick={() => (open ? closeMenu() : setOpen(true))}
          title="Send an emoji, attachment or GIF"
          aria-label="Send an emoji, attachment or GIF"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted transition hover:bg-hover hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={closeMenu} />
            <div className="card-shadow absolute bottom-14 left-0 z-20 w-[22rem] overflow-hidden rounded-xl border border-line-strong bg-elevated p-2">
              {panel === "root" && (
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setPanel("emoji")}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition hover:bg-hover"
                  >
                    <span className="text-lg">😊</span> Emoji
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition hover:bg-hover"
                  >
                    <span className="text-lg">📎</span>
                    {uploading ? "Uploading…" : "Upload a file"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel("gif")}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition hover:bg-hover"
                  >
                    <span className="text-lg">🎞️</span> GIFs
                  </button>
                </div>
              )}

              {panel === "emoji" && (
                <div>
                  <div className="mb-1 flex items-center gap-2 px-1">
                    <button
                      type="button"
                      onClick={() => setPanel("root")}
                      className="text-xs text-faint transition hover:text-ink"
                    >
                      ← Back
                    </button>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                      Emoji
                    </span>
                  </div>
                  <div className="grid max-h-60 grid-cols-8 gap-0.5 overflow-y-auto">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setDraft((value) => value + emoji);
                          setPanel("root");
                          setOpen(false);
                          textareaRef.current?.focus();
                        }}
                        className="rounded-lg p-1 text-xl transition hover:bg-hover"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {panel === "gif" && (
                <div>
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <button
                      type="button"
                      onClick={() => setPanel("root")}
                      className="text-xs text-faint transition hover:text-ink"
                    >
                      ← Back
                    </button>
                    <input
                      autoFocus
                      value={gifQuery}
                      onChange={(event) => setGifQuery(event.target.value)}
                      placeholder="Search GIPHY"
                      className="min-w-0 flex-1 rounded-lg border border-line bg-base px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
                    />
                  </div>

                  {gifState === "needsKey" && (
                    <p className="px-1 py-3 text-xs leading-relaxed text-muted">
                      GIFs come from GIPHY. Grab a free API key at developers.giphy.com and set{" "}
                      <span className="text-ink">GIPHY_API_KEY</span> in your Vercel project.
                    </p>
                  )}
                  {gifState === "error" && (
                    <p className="px-1 py-3 text-xs text-danger">Could not load GIFs right now.</p>
                  )}

                  {gifState !== "needsKey" && (
                    <>
                      <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
                        {gifQuery.trim() ? "Results" : "Trending"}
                      </p>
                      <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
                        {gifState === "loading" && gifs.length === 0
                          ? Array.from({ length: 6 }).map((_, index) => (
                              <div
                                key={index}
                                className="pulse-soft h-24 rounded-lg bg-raised"
                              />
                            ))
                          : gifs.map((gif) => (
                              <button
                                key={gif.id}
                                type="button"
                                onClick={() => sendGif(gif)}
                                title={gif.title}
                                className="group relative h-24 overflow-hidden rounded-lg bg-raised transition hover:ring-2 hover:ring-accent"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={gif.preview}
                                  alt={gif.title}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ))}
                      </div>
                      {gifState !== "loading" && gifs.length === 0 && (
                        <p className="px-1 py-3 text-xs text-faint">No GIFs for that one.</p>
                      )}
                      <p className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                        Powered by GIPHY
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {pending && (
          <div className="absolute -top-[4.5rem] left-2 flex items-center gap-2 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-sm text-ink">
            <span>📎</span>
            <span className="max-w-[12rem] truncate">{pending.filename}</span>
            <span className="text-xs text-faint">{formatBytes(pending.sizeBytes)}</span>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="ml-1 text-faint transition hover:text-danger"
              aria-label="Remove attachment"
            >
              ✕
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={placeholder}
          className="max-h-44 min-w-0 flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint"
        />

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
      </div>
    </div>
  );
}
