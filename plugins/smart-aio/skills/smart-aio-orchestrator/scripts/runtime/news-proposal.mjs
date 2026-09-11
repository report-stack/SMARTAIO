// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { createHash } from "node:crypto";
import { assertSingleClient, requireClientId } from "./client-scope.mjs";
import { similarity } from "../../../article-production/scripts/article_workflow.mjs";

const BLOCKED_NEWS_STATUSES = new Set(["ADVERTISEMENT", "REPRINT", "UNVERIFIED", "USAGE_PROHIBITED", "DUPLICATE"]);
const DECISIONS = new Set(["ADOPT", "HOLD", "REJECT"]);
const DECISION_ROLES = new Set(["system-ai"]);

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function digest(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function normalizedTerms(values) {
  return (Array.isArray(values) ? values : []).map((value) => String(value).normalize("NFKC").toLowerCase().trim()).filter(Boolean);
}

function matches(text, terms) {
  const haystack = String(text || "").normalize("NFKC").toLowerCase();
  return terms.filter((term) => haystack.includes(term));
}

export function scoreNewsRelevance({ news_item, client_context = {} }) {
  const text = `${news_item.title} ${news_item.summary || ""}`;
  const serviceMatches = matches(text, normalizedTerms(client_context.service_terms));
  const audienceMatches = matches(text, normalizedTerms(client_context.audience_terms));
  const topicMatches = matches(text, normalizedTerms(client_context.topic_terms));
  const trustedSource = new Set(["OFFICIAL", "INDUSTRY_ASSOCIATION", "公式", "業界団体"]).has(String(news_item.source_type || ""));
  const score = Math.min(100, 10 + Math.min(30, serviceMatches.length * 15) + Math.min(20, audienceMatches.length * 10) + Math.min(25, topicMatches.length * 10) + (trustedSource ? 15 : 5));
  const reasons = [];
  if (serviceMatches.length) reasons.push(`サービス関連語: ${serviceMatches.join(", ")}`);
  if (audienceMatches.length) reasons.push(`対象読者関連語: ${audienceMatches.join(", ")}`);
  if (topicMatches.length) reasons.push(`記事テーマ関連語: ${topicMatches.join(", ")}`);
  reasons.push(trustedSource ? "許可された一次性の高い収集元" : "許可されたニュース収集元");
  return Object.freeze({ relevance_score: score, client_relevance_reason: reasons.join("／") });
}

function newestRelevantArticle(news, articles) {
  const newsText = `${news.title} ${news.summary || ""}`;
  return articles.map((article) => ({
    article,
    score: similarity(newsText, `${article.title || ""} ${article.searchIntent || ""} ${article.conclusionSummary || ""}`),
  })).sort((left, right) => right.score - left.score)[0] || null;
}

export function classifyNewsOpportunity({ news_item, relevance, existing_articles = [] }) {
  if (relevance.relevance_score < 30) return Object.freeze({ proposal_type: "NO_ACTION", related_article_ids: [], reason: "顧客との関連度が基準未満" });
  const related = newestRelevantArticle(news_item, existing_articles);
  if (!related || related.score < 0.15) return Object.freeze({ proposal_type: "NEW_ARTICLE", related_article_ids: [], reason: "関連度は高いが扱う既存記事がない" });
  const changeSignal = /(改定|変更|更新|新機能|提供開始|発表|廃止|料金)/.test(`${news_item.title} ${news_item.summary || ""}`);
  return Object.freeze({
    proposal_type: changeSignal ? "UPDATE" : "APPEND",
    related_article_ids: [related.article.article_id],
    reason: changeSignal ? "関連する既存記事があり、内容変更を伴うニュース" : "関連する既存記事へ補足できるニュース",
  });
}

export function createNewsProposal({ client_id, news_item, client_context = {}, existing_articles = [], created_at = new Date().toISOString() }) {
  const clientId = requireClientId(client_id);
  if (String(news_item?.client_id || "").trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:news_item");
  assertSingleClient(existing_articles, clientId);
  requireText(news_item.news_id, "news.news_id");
  const canonicalUrl = requireText(news_item.canonical_url, "news.canonical_url");
  if (!news_item.published_at && !news_item.obtained_at) throw new Error("NEWS_DATE_REQUIRED");
  if (BLOCKED_NEWS_STATUSES.has(String(news_item.status || "").toUpperCase())) throw new Error(`NEWS_NOT_ELIGIBLE:${news_item.status}`);
  requireText(news_item.client_relevance_reason, "news.client_relevance_reason");

  const relevance = scoreNewsRelevance({ news_item, client_context });
  const classification = classifyNewsOpportunity({ news_item, relevance, existing_articles });
  const proposalId = `prop_${digest(`${clientId}|${news_item.news_id}|${classification.proposal_type}`).slice(0, 24)}`;
  return Object.freeze({
    client_id: clientId,
    proposal_id: proposalId,
    news_id: news_item.news_id,
    proposal_type: classification.proposal_type,
    title: classification.proposal_type === "NO_ACTION" ? `対応不要: ${news_item.title}` : `ニュース起点候補: ${news_item.title}`,
    summary: news_item.summary || news_item.title,
    source_urls: [canonicalUrl],
    related_article_ids: classification.related_article_ids,
    relevance_score: relevance.relevance_score,
    judgement: "AI_RULE_BASED",
    reason: `${classification.reason}／${relevance.client_relevance_reason}`,
    owner: "Smart AIOニュース選定AI",
    status: classification.proposal_type === "NO_ACTION" ? "AI_REJECTED_NO_ACTION" : "AI_SELECTED_AWAITING_ARTICLE_REQUEST",
    intermediate_human_decision_required: false,
    article_generation_allowed: false,
    next_action: classification.proposal_type === "NO_ACTION" ? "NONE" : "WAIT_FOR_ARTICLE_REQUEST",
    created_at: new Date(created_at).toISOString(),
  });
}

export function decideNewsProposal(proposal, decision) {
  const clientId = requireClientId(proposal?.client_id);
  if (String(decision?.client_id || "").trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:proposal_decision");
  if (String(decision?.proposal_id || "").trim() !== proposal.proposal_id) throw new Error("PROPOSAL_SCOPE_MISMATCH");
  const value = requireText(decision.decision, "decision.decision").toUpperCase();
  const role = requireText(decision.decided_by_role, "decision.decided_by_role").toLowerCase();
  if (!DECISIONS.has(value)) throw new Error(`UNKNOWN_PROPOSAL_DECISION:${value}`);
  if (!DECISION_ROLES.has(role)) throw new Error("PROPOSAL_DECISION_ROLE_NOT_ALLOWED");
  const status = value === "ADOPT" ? "AI_SELECTED_AWAITING_ARTICLE_REQUEST" : value === "HOLD" ? "AI_ON_HOLD" : "AI_REJECTED";
  return Object.freeze({
    ...proposal,
    status,
    ai_decision: value,
    decided_by: requireText(decision.decided_by, "decision.decided_by"),
    decided_by_role: role,
    decision_reason: requireText(decision.reason, "decision.reason"),
    decided_at: new Date(requireText(decision.decided_at, "decision.decided_at")).toISOString(),
    article_generation_allowed: false,
    next_action: value === "ADOPT" ? "WAIT_FOR_ARTICLE_REQUEST" : "NONE",
  });
}

export class InMemoryProposalDecisionLedger {
  #decisions = new Map();

  record(proposal, decision) {
    const key = `${proposal.client_id}|${proposal.proposal_id}`;
    const previous = this.#decisions.get(key);
    if (previous) {
      const same = previous.ai_decision === String(decision.decision).toUpperCase() && previous.decided_by === decision.decided_by;
      if (same) return Object.freeze({ accepted: false, reason: "ALREADY_RECORDED", proposal: previous });
      throw new Error("PROPOSAL_DECISION_ALREADY_FINAL");
    }
    const decided = decideNewsProposal(proposal, decision);
    this.#decisions.set(key, decided);
    return Object.freeze({ accepted: true, proposal: decided });
  }
}
