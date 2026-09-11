// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { prepareNewsInbox } from "./news-ranking-scheduler.mjs";

const MAX_FEED_BYTES = 2 * 1024 * 1024;

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x?[0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function plainText(value) {
  return decodeEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(block, names) {
  for (const name of names) {
    const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
    if (match) return match[1];
  }
  return "";
}

function atomLink(block) {
  const alternate = /<link\b(?=[^>]*\brel=["']alternate["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i.exec(block);
  const any = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i.exec(block);
  return decodeEntities((alternate || any || [])[1] || "");
}

export function parseRssOrAtom(xml) {
  const source = requireText(xml, "feed_xml");
  if (Buffer.byteLength(source, "utf8") > MAX_FEED_BYTES) throw new Error("FEED_TOO_LARGE");
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("UNSAFE_XML_DECLARATION");
  const isAtom = /<feed\b/i.test(source);
  const blocks = [...source.matchAll(isAtom ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi : /<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  if (blocks.length === 0) throw new Error("NO_FEED_ITEMS_FOUND");
  return blocks.map((block) => ({
    title: plainText(tag(block, ["title"])),
    url: isAtom ? atomLink(block) : plainText(tag(block, ["link", "guid"])),
    summary: plainText(tag(block, ["description", "summary", "content", "content:encoded"])),
    published_at: plainText(tag(block, ["pubDate", "published", "updated", "dc:date"])) || null,
  })).filter((item) => item.title && item.url);
}

export function filterFeedItems(items, { include_keywords = [], exclude_keywords = [] }) {
  const include = include_keywords.map((value) => String(value).normalize("NFKC").toLowerCase().trim()).filter(Boolean);
  const exclude = exclude_keywords.map((value) => String(value).normalize("NFKC").toLowerCase().trim()).filter(Boolean);
  return items.filter((item) => {
    const haystack = `${item.title} ${item.summary}`.normalize("NFKC").toLowerCase();
    return (include.length === 0 || include.some((keyword) => haystack.includes(keyword)))
      && !exclude.some((keyword) => haystack.includes(keyword));
  });
}

export async function collectRssNews({ client_id, feed, existing_items = [], obtained_at = new Date().toISOString(), fetch_impl = fetch }) {
  const sourceUrl = new URL(requireText(feed?.source_url, "feed.source_url"));
  if (sourceUrl.protocol !== "https:") throw new Error("HTTPS_REQUIRED_FOR_FEED");
  const response = await fetch_impl(sourceUrl, { headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`FEED_HTTP_ERROR:${response.status}`);
  const xml = await response.text();
  const parsed = parseRssOrAtom(xml);
  const fetchedItems = filterFeedItems(parsed, feed);
  return prepareNewsInbox({ client_id, feed, fetched_items: fetchedItems, existing_items, obtained_at });
}
