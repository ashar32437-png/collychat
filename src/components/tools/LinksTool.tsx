"use client";

type HubLink = { name: string; url: string };

const LINKS: HubLink[] = [
  { name: "OneNote", url: "https://www.onenote.com/notebooks" },
  { name: "Outlook", url: "https://outlook.office.com/mail/" },
  { name: "Teams", url: "https://teams.microsoft.com/" },
  { name: "Student Hub", url: "https://students.cwa.ac.uk/learner/" },
  { name: "LEARN", url: "https://learn.cwa.ac.uk/" },
  { name: "LEaP", url: "https://learn.cwa.ac.uk/course/view.php?id=1432" },
  { name: "Units", url: "https://learn.cwa.ac.uk/course/view.php?id=12911" },
  { name: "Google", url: "https://www.google.com" },
  { name: "Neal.fun", url: "https://neal.fun" },
  { name: "Openguessr", url: "https://openguessr.com" },
];

export default function LinksTool() {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {LINKS.map((link) => (
          <a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 transition hover:border-line-strong hover:bg-raised"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-[15px] font-semibold text-muted transition group-hover:text-ink">
              {link.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
              {link.name}
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-faint transition group-hover:text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 5h5v5M19 5l-7.5 7.5M17 14v4.5A1.5 1.5 0 0 1 15.5 20h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
