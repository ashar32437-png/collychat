// Sticky notes are a personal tool: they live in this browser's localStorage.
// Images are uploaded through /api/attachments, so only their URLs are stored here.

export type NoteImage = {
  id: string;
  url: string;
  /** position inside the note card, in percent of card size */
  x: number;
  y: number;
  /** width in percent of card size */
  width: number;
};

export type NoteLink = { id: string; url: string; label: string };

export type StickyNote = {
  id: string;
  text: string;
  images: NoteImage[];
  links: NoteLink[];
  /** position on the board, in pixels (board-relative) */
  x: number;
  y: number;
  tone: string;
  updatedAt: number;
};

export const NOTES_STORAGE_KEY = "chatter.sticky-notes";

export const NOTE_TONES = [
  "#2a2f3a",
  "#33303a",
  "#2b3330",
  "#34302a",
  "#2e2b38",
  "#2a3237",
];

export const newId = () => Math.random().toString(36).slice(2, 10);

export function createNote(index: number): StickyNote {
  return {
    id: newId(),
    text: "",
    images: [],
    links: [],
    x: 24 + (index % 4) * 210,
    y: 24 + Math.floor(index / 4) * 170,
    tone: NOTE_TONES[index % NOTE_TONES.length],
    updatedAt: Date.now(),
  };
}

export function loadNotes(): StickyNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is StickyNote => {
        if (item == null || typeof item !== "object") return false;
        const note = item as Partial<StickyNote>;
        return typeof note.id === "string" && typeof note.text === "string";
      })
      .map((note) => ({
        ...note,
        images: Array.isArray(note.images) ? note.images : [],
        links: Array.isArray(note.links) ? note.links : [],
        x: Number.isFinite(note.x) ? note.x : 24,
        y: Number.isFinite(note.y) ? note.y : 24,
        tone: note.tone ?? NOTE_TONES[0],
      }));
  } catch {
    return [];
  }
}

export function saveNotes(notes: StickyNote[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    /* storage full or unavailable — notes stay in memory for this session */
  }
}

export function noteTitle(note: StickyNote): string {
  const firstLine = note.text.split("\n").map((line) => line.trim()).find(Boolean);
  if (firstLine) return firstLine.slice(0, 48);
  if (note.images.length > 0) return note.images.length + " image" + (note.images.length > 1 ? "s" : "");
  return "Empty note";
}
