// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { verifyImagePersistence } from "./image-persistence.mjs";
function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function normalizeRow(row, index) {
  return Object.freeze({
    row: Number(row.row || index + 3),
    hasIdea: Boolean(row.hasIdea),
    hasDocument: Boolean(row.hasDocument),
    hasImages: Boolean(row.hasImages),
  });
}

export function createBatchState({ client_id, totalArticles, rows = [], now = new Date() }) {
  const clientId = requireText(client_id, "client_id");
  const requested = Number(totalArticles);
  if (!Number.isInteger(requested) || requested < 0) throw new TypeError("totalArticles must be a non-negative integer");
  return Object.freeze({
    client_id: clientId,
    totalArticles: requested,
    mode: requested === 0 ? "HOLE_FILL" : "NORMAL",
    running: true,
    ideasCount: 0,
    docCount: 0,
    imagesCount: 0,
    rows: Object.freeze(rows.map(normalizeRow)),
    startedAt: now.toISOString(),
    finishedAt: null,
  });
}

function scanRows(rows) {
  const sorted = rows.map(normalizeRow).sort((a, b) => a.row - b.row);
  const withIdea = sorted.filter((row) => row.hasIdea);
  const dLastRow = withIdea.length ? Math.max(...withIdea.map((row) => row.row)) : 2;
  return Object.freeze({
    rows: sorted,
    dRow: sorted.find((row) => !row.hasIdea)?.row ?? null,
    nRow: sorted.find((row) => !row.hasDocument)?.row ?? null,
    qRow: sorted.find((row) => !row.hasImages)?.row ?? null,
    dLastRow,
    nRowWithData: sorted.find((row) => row.hasIdea && !row.hasDocument)?.row ?? null,
    qRowWithData: sorted.find((row) => row.hasIdea && !row.hasImages)?.row ?? null,
  });
}

function standardNextStep(search, totalArticles, state) {
  if (totalArticles === 0) {
    const dCandidate = search.dRow !== null && search.dRow <= search.dLastRow ? search.dRow : Infinity;
    const nCandidate = search.nRowWithData ?? Infinity;
    const qCandidate = search.qRowWithData ?? Infinity;
    if (dCandidate === Infinity && nCandidate === Infinity && qCandidate === Infinity) return null;
    const minRow = Math.min(dCandidate, nCandidate, qCandidate);
    if (minRow === dCandidate) return "ideas";
    if (minRow === nCandidate) return "doc";
    if (minRow === qCandidate) return "images";
    return null;
  }

  const ideasDone = Number(state.ideasCount) >= totalArticles;
  if (search.qRow !== null) {
    if (search.nRow === null) return "images";
    if (search.qRow < search.nRow) return "images";
    if (search.qRow === search.nRow) {
      if (search.dRow === null || search.nRow < search.dRow) return "doc";
      if (search.nRow === search.dRow) {
        if (!ideasDone) return "ideas";
        if (search.nRowWithData !== null) return "doc";
        if (search.qRowWithData !== null) return "images";
        return null;
      }
    }
    if (search.qRow > search.nRow) {
      if (search.dRow !== null && search.nRow === search.dRow) {
        if (!ideasDone) return "ideas";
        if (search.nRowWithData !== null) return "doc";
        if (search.qRowWithData !== null) return "images";
        return null;
      }
      return "doc";
    }
  }
  if (search.qRow === null) {
    if (search.nRow !== null) {
      if (search.dRow !== null && search.nRow === search.dRow) {
        if (!ideasDone) return "ideas";
        if (search.nRowWithData !== null) return "doc";
        return null;
      }
      return "doc";
    }
    if (!ideasDone) return "ideas";
    return null;
  }
  return null;
}

export function determineNextBatchStep(state) {
  const clientId = requireText(state?.client_id, "client_id");
  if (!state.running) return Object.freeze({ client_id: clientId, step: null, reason: "STOPPED" });
  const search = scanRows(state.rows || []);
  const totalArticles = Number(state.totalArticles);
  const step = standardNextStep(search, totalArticles, state);
  if (!step) return Object.freeze({ client_id: clientId, step: null, reason: "COMPLETE" });
  const row = step === "ideas"
    ? search.dRow ?? Math.max(2, ...search.rows.map((item) => item.row)) + 1
    : step === "doc"
      ? search.nRowWithData
      : search.rows.find((item) => item.hasIdea && item.hasDocument && !item.hasImages)?.row ?? search.qRowWithData;
  if (row === null || row === undefined) throw new Error(`NO_EXECUTABLE_ROW_FOR_${step.toUpperCase()}`);
  return Object.freeze({
    client_id: clientId,
    step,
    row,
    reason: totalArticles === 0 ? "STANDARD_HOLE_FILL_PRIORITY" : "STANDARD_NORMAL_PRIORITY",
  });
}

export function applyBatchStep(state, completed, { now = new Date() } = {}) {
  const next = determineNextBatchStep(state);
  if (!next.step) return Object.freeze({ ...state, running: false, finishedAt: now.toISOString() });
  if (completed?.client_id !== state.client_id) throw new Error("CROSS_CLIENT_DATA_DETECTED:batch");
  if (completed?.step !== next.step || Number(completed?.row) !== next.row) throw new Error("BATCH_STEP_MISMATCH");
  if (next.step === "images") {
    verifyImagePersistence(completed?.image_persistence, {
      client_id: state.client_id,
      article_id: completed?.article_id,
    });
  }

  const rows = (state.rows || []).map(normalizeRow);
  let target = rows.find((row) => row.row === next.row);
  if (!target) {
    target = normalizeRow({ row: next.row }, rows.length);
    rows.push(target);
  }
  const updated = rows.map((row) => row.row !== next.row ? row : Object.freeze({
    ...row,
    hasIdea: row.hasIdea || next.step === "ideas",
    hasDocument: row.hasDocument || next.step === "doc",
    hasImages: row.hasImages || next.step === "images",
  }));
  const advanced = {
    ...state,
    rows: Object.freeze(updated.sort((a, b) => a.row - b.row)),
    ideasCount: Number(state.ideasCount || 0) + (next.step === "ideas" ? 1 : 0),
    docCount: Number(state.docCount || 0) + (next.step === "doc" ? 1 : 0),
    imagesCount: Number(state.imagesCount || 0) + (next.step === "images" ? 1 : 0),
    error: null,
    errorStep: null,
  };
  const following = determineNextBatchStep(advanced);
  return Object.freeze(following.step ? advanced : {
    ...advanced,
    running: false,
    finishedAt: now.toISOString(),
  });
}

export function failBatchStep(state, failure, { now = new Date() } = {}) {
  const clientId = requireText(state?.client_id, "client_id");
  if (String(failure?.client_id || "").trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:batch_failure");
  const expected = determineNextBatchStep(state);
  if (!expected.step) throw new Error("NO_ACTIVE_BATCH_STEP");
  if (String(failure?.step || "") !== expected.step) throw new Error("BATCH_STEP_MISMATCH");
  return Object.freeze({
    ...state,
    running: false,
    error: requireText(failure?.error, "failure.error"),
    errorStep: expected.step,
    failedAt: now.toISOString(),
  });
}

export function stopBatch(state, { now = new Date() } = {}) {
  return Object.freeze({ ...state, running: false, stoppedAt: now.toISOString() });
}

export function resumeBatch(state) {
  if (state.finishedAt) throw new Error("BATCH_ALREADY_FINISHED");
  return Object.freeze({ ...state, running: true, stoppedAt: null, error: null, errorStep: null, failedAt: null });
}
