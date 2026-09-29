"use client";

import { Avatar, formatBytes } from "./avatar";
import type { Message } from "@/lib/types";

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  const clock = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (daysAgo === 0) return "Today at " + clock;
  if (daysAgo === 1) return "Yesterday at " + clock;
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " at " + clock;
}

function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-accent-soft underline decoration-accent-soft/40 hover:decoration-accent-soft"
          >
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

function AttachmentView({ message }: { message: Message }) {
  const attachment = message.attachment;
  if (!attachment) return null;

  if (attachment.isImage) {
    const image = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={attachment.url}
        alt={attachment.filename}
        className="mt-1.5 max-h-72 max-w-sm rounded-xl border border-line-strong"
      />
    );
    return attachment.remoteUrl ? (
      <a href={attachment.remoteUrl} target="_blank" rel="noopener noreferrer">
        {image}
      </a>
    ) : (
      image
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex w-fit items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-accent-soft transition hover:bg-raised"
    >
      <span>📎</span>
      <span className="max-w-[16rem] truncate">{attachment.filename}</span>
      <span className="text-faint">{formatBytes(attachment.sizeBytes)}</span>
    </a>
  );
}

export default function MessageList({
  messages,
  onRetry,
}: {
  /** `pending` marks a message still on its way; `failed` marks one that bounced. */
  messages: (Message & { pending?: boolean; failed?: boolean })[];
  onRetry?: (clientId: string) => void;
}) {
  return (
    <>
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay =
          !previous ||
          new Date(previous.createdAt).toDateString() !==
            new Date(message.createdAt).toDateString();
        const grouped =
          !newDay &&
          previous != null &&
          previous.authorId === message.authorId &&
          new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
            GROUP_WINDOW_MS;

        return (
          // Optimistic messages all arrive with id 0, so they key off their own
          // client id until the stored one replaces them.
          <div key={message.clientId ?? message.id}>
            {newDay && (
              <div className="my-4 flex items-center gap-3 px-2">
                <div className="h-px flex-1 bg-line-strong" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
                  {dayLabel(message.createdAt)}
                </span>
                <div className="h-px flex-1 bg-line-strong" />
              </div>
            )}
            <div
              className={
                "group -mx-2 flex gap-4 rounded-lg px-2 py-0.5 transition hover:bg-raised/40 " +
                (grouped ? "" : "mt-3")
              }
            >
              <div className="flex w-10 shrink-0 justify-center">
                {grouped ? (
                  <span className="pt-1 text-[10px] leading-5 text-faint opacity-0 transition group-hover:opacity-100">
                    {clockLabel(message.createdAt)}
                  </span>
                ) : (
                  <Avatar
                    name={message.authorName}
                    url={message.authorAvatarUrl}
                    size={40}
                    ringColor="var(--color-base)"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <p className="flex items-baseline gap-2">
                    <span className="font-semibold text-ink">{message.authorName}</span>
                    <span className="text-[11px] text-faint">{timeLabel(message.createdAt)}</span>
                  </p>
                )}
                {message.body && (
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink/90">
                    <Linkified text={message.body} />
                  </p>
                )}
                <AttachmentView message={message} />
                {message.pending &&
                  (message.failed ? (
                    <button
                      type="button"
                      onClick={() => onRetry?.(message.clientId as string)}
                      className="mt-0.5 text-[11px] font-medium text-danger transition hover:underline"
                    >
                      Not sent — tap to retry
                    </button>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-faint">Sending…</p>
                  ))}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
