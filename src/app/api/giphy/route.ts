import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GIPHY powers the picker: trending while the search box is empty, search
// results once there is a query. The key stays on the server.
const ENDPOINT = "https://api.giphy.com/v1/gifs/";
// `messaging_non_clips` keeps the results to things people actually send.
const COMMON = "&limit=24&rating=pg-13&lang=en&bundle=messaging_non_clips";

type GiphyImage = { url?: string; width?: string; height?: string };
type GiphyItem = {
  id: string;
  title?: string;
  images?: Record<string, GiphyImage | undefined>;
};

const pick = (images: Record<string, GiphyImage | undefined> | undefined, keys: string[]) => {
  for (const key of keys) {
    const url = images?.[key]?.url;
    if (url) return url;
  }
  return "";
};

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = (process.env.GIPHY_API_KEY ?? process.env.GIPHY_KEY)?.trim();
  if (!key) return NextResponse.json({ results: [], needsKey: true });

  const query = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const url =
    ENDPOINT +
    (query ? "search" : "trending") +
    "?api_key=" +
    encodeURIComponent(key) +
    COMMON +
    (query ? "&q=" + encodeURIComponent(query) : "");

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error("giphy request failed", res.status);
      return NextResponse.json({
        results: [],
        error: res.status === 401 || res.status === 403 ? "GIPHY rejected the API key" : "GIPHY is not reachable right now",
      });
    }
    const data = (await res.json()) as { data?: GiphyItem[] };
    const results = (data.data ?? [])
      .map((item) => ({
        id: item.id,
        title: item.title || "GIF",
        // A tiny still-ish preview keeps the grid light…
        preview: pick(item.images, ["fixed_height_small", "fixed_height_downsampled", "fixed_height", "original"]),
        // …while the sent message uses the downsized animation (<= 2 MB).
        gif: pick(item.images, ["downsized_medium", "fixed_height", "original"]),
      }))
      .filter((item) => item.gif && item.preview)
      .slice(0, 24);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("giphy failed", err);
    return NextResponse.json({ results: [], error: "Could not load GIFs" });
  }
}
