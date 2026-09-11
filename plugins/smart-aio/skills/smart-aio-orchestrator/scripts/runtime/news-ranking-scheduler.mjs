// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { createHash } from "node:crypto";
import { assertSingleClient, filterByClient, requireClientId } from "./client-scope.mjs";

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function digest(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function localClock(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minuteOfDay: Number(values.hour) * 60 + Number(values.minute) };
}

export function parseDailySchedule(expression) {
  const match = /^daily@(\d{2}):(\d{2})$/.exec(requireText(expression, "schedule_expression"));
  if (!match) throw new Error("INVALID_SCHEDULE_EXPRESSION:expected daily@HH:MM");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("INVALID_SCHEDULE_TIME");
  return Object.freeze({ hour, minute, minuteOfDay: hour * 60 + minute });
}

export function isScheduleDue(schedule, { now = new Date() } = {}) {
  if (!schedule?.enabled) return false;
  requireClientId(schedule.client_id);
  const timeZone = requireText(schedule.timezone || "Asia/Tokyo", "timezone");
  const target = parseDailySchedule(schedule.schedule_expression);
  const current = localClock(now, timeZone);
  if (current.minuteOfDay < target.minuteOfDay) return false;
  if (!schedule.last_run_at) return true;
  return localClock(new Date(schedule.last_run_at), timeZone).date !== current.date;
}

export function dueClientSchedules({ client_id, schedules = [], now = new Date() }) {
  const clientId = requireClientId(client_id);
  assertSingleClient(schedules, clientId);
  return schedules.filter((schedule) => isScheduleDue(schedule, { now }));
}

export function canonicalizeUrl(value) {
  const url = new URL(requireText(value, "url"));
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("UNSUPPORTED_SOURCE_URL");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function newsContentFingerprint(item) {
  const normalized = [item.title, item.summary || item.content]
    .map((value) => String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
  return digest(normalized);
}

export function prepareNewsInbox({ client_id, feed, fetched_items = [], existing_items = [], obtained_at = new Date().toISOString() }) {
  const clientId = requireClientId(client_id);
  if (String(feed?.client_id || "").trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:feed");
  if (!feed.enabled) return Object.freeze({ client_id: clientId, feed_id: feed.feed_id, accepted: [], duplicates: [] });
  requireText(feed.feed_id, "feed.feed_id");
  requireText(feed.industry, "feed.industry");
  requireText(feed.source_url, "feed.source_url");
  if (!Array.isArray(feed.include_keywords)) throw new TypeError("feed.include_keywords must be an array");
  assertSingleClient(existing_items, clientId);
  for (const item of fetched_items) if (item.client_id && String(item.client_id).trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:fetched_items");

  const seenUrls = new Set(existing_items.map((item) => canonicalizeUrl(item.canonical_url)));
  const seenFingerprints = new Set(existing_items.map((item) => item.content_fingerprint));
  const accepted = [];
  const duplicates = [];
  for (const item of fetched_items) {
    const canonicalUrl = canonicalizeUrl(item.canonical_url || item.url);
    const fingerprint = newsContentFingerprint(item);
    const duplicate = seenUrls.has(canonicalUrl) || seenFingerprints.has(fingerprint);
    const record = Object.freeze({
      client_id: clientId,
      news_id: item.news_id || `news_${digest(`${clientId}|${feed.feed_id}|${canonicalUrl}`).slice(0, 24)}`,
      feed_id: feed.feed_id,
      title: requireText(item.title, "news.title"),
      canonical_url: canonicalUrl,
      published_at: item.published_at || null,
      obtained_at: requireText(item.obtained_at || obtained_at, "news.obtained_at"),
      summary: String(item.summary || "").trim(),
      content_fingerprint: fingerprint,
      relevance_score: item.relevance_score ?? null,
      client_relevance_reason: String(item.client_relevance_reason || "").trim(),
      status: duplicate ? "DUPLICATE" : "NEW",
    });
    (duplicate ? duplicates : accepted).push(record);
    seenUrls.add(canonicalUrl);
    seenFingerprints.add(fingerprint);
  }
  return Object.freeze({ client_id: clientId, feed_id: feed.feed_id, accepted, duplicates });
}

export function prepareRankingRequests({ client_id, configs = [] }) {
  const clientId = requireClientId(client_id);
  assertSingleClient(configs, clientId);
  return filterByClient(configs, clientId).filter((config) => config.enabled).flatMap((config) => {
    const domain = requireText(config.domain, "ranking.domain");
    const provider = requireText(config.provider, "ranking.provider");
    if (!Array.isArray(config.keywords) || config.keywords.length === 0) throw new TypeError("ranking.keywords must not be empty");
    return config.keywords.map((keyword) => Object.freeze({
      client_id: clientId,
      ranking_config_id: requireText(config.ranking_config_id, "ranking.ranking_config_id"),
      provider, domain, keyword: requireText(keyword, "ranking.keyword"),
      country: config.country || "JP", device: config.device || "desktop",
    }));
  });
}

export function normalizeRankingSnapshots({ client_id, requests = [], results = [], obtained_at = new Date().toISOString() }) {
  const clientId = requireClientId(client_id);
  assertSingleClient(requests, clientId);
  assertSingleClient(results, clientId);
  const requestKeys = new Set(requests.map((item) => `${item.ranking_config_id}|${item.keyword}|${item.device}`));
  return results.map((result) => {
    const key = `${result.ranking_config_id}|${result.keyword}|${result.device || "desktop"}`;
    if (!requestKeys.has(key)) throw new Error("UNREQUESTED_RANKING_RESULT");
    const position = Number(result.position);
    if (!Number.isInteger(position) || position < 1) throw new TypeError("ranking.position must be a positive integer");
    return Object.freeze({
      client_id: clientId, ranking_config_id: result.ranking_config_id, keyword: result.keyword,
      device: result.device || "desktop", position, landing_url: result.landing_url || null,
      provider: requireText(result.provider, "ranking.provider"),
      obtained_at: requireText(result.obtained_at || obtained_at, "ranking.obtained_at"),
    });
  });
}
