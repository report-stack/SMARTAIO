#!/usr/bin/env node

import { createInterface } from "node:readline";
import { runSmartAioCommand } from "../skills/smart-aio-orchestrator/scripts/smart_aio_orchestrator.mjs";

export const SMART_AIO_RUNTIME_COMMANDS = Object.freeze([
  "verify",
  "system-contract-report",
  "prepare-client-production-sheet",
  "validate-client-production-sheet",
  "prepare-plan-confirmation-sheet",
  "validate-plan-confirmation-candidates",
  "select-next-approved-plan",
  "prepare-additional-plan-confirmation-ideas",
  "prepare-client-source-register",
  "validate-client-source-register",
  "prepare-client-article-sheet-update",
  "prepare-news-settings-template",
  "prepare-client-onboarding",
  "prepare-basic-info",
  "validate-basic-info",
  "prepare-site-title",
  "validate-site-title",
  "prepare-category-slugs",
  "validate-category-slugs",
  "prepare-images",
  "plan-idea",
  "prepare-idea",
  "analyze-title",
  "resolve-article-category",
  "build-expected-article-url",
  "validate-ideas",
  "finalize-idea",
  "prepare-article",
  "prepare-article-record-update",
  "prepare-document-output",
  "prepare-completion-report",
  "audit-client-run",
  "verify-article-document-readback",
  "verify-image-persistence",
  "verify-article-visual-persistence",
  "plan-internal-link-graph",
  "prepare-internal-link-sheet-output",
  "verify-internal-link-graph",
  "build-structured-markup",
  "verify-structured-markup",
  "prepare-rewrite-plan",
  "prepare-rewrite-artifact-output",
  "prepare-xlsx-export",
  "prepare-cluster",
  "complete-cluster",
  "prepare-batch-notification",
  "analyze-article",
  "review-article",
  "prepare-stage-review",
  "evaluate-stage-review",
  "draft-workflow",
  "release-publication",
  "create-batch",
  "batch-next",
  "apply-batch-step",
  "fail-batch-step",
  "stop-batch",
  "resume-batch",
  "prepare-news-inbox",
  "news-proposal",
  "decide-news-proposal",
  "prepare-ranking-requests",
  "prepare-ahrefs",
  "create-article-lifecycle",
  "advance-article-lifecycle",
  "plan-skill",
  "evaluate-skill",
  "evaluate-skill-run",
  "propose-skill-fix",
  "curate-skill-feedback",
  "authorize-skill-change",
  "create-readiness",
  "record-readiness",
  "evaluate-readiness",
  "prepare-scheduled-tasks",
  "authorize-scheduled-task",
  "create-performance-report",
  "create-report-schedule",
  "analyze-performance-feedback",
  "propose-performance-skill-update",
  "deletion-plan",
  "authorize-deletion"
]);

const commandSet = new Set(SMART_AIO_RUNTIME_COMMANDS);

const tools = Object.freeze([
  {
    name: "smart_aio_verify_runtime",
    description: "Verify the bundled SMART AIO runtime and protected prompt registry before any article workflow. Returns READY only when all protected prompt hashes and assembly rules pass.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "smart_aio_select_next_approved_plan",
    description: "Select exactly one next approved, unfinished article plan for a single client. Pass the企画確認 rows and the same-client article evidence required by the SMART AIO workflow.",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "object", description: "Input object accepted by select-next-approved-plan." }
      },
      required: ["input"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  {
    name: "smart_aio_run_workflow_step",
    description: "Run one bundled SMART AIO validation, planning, lifecycle, review, or output-preparation command. This tool only computes and validates workflow data; external Drive, Sheets, publishing, deletion, and scheduling actions remain subject to the plugin's human approval and connector rules.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", enum: SMART_AIO_RUNTIME_COMMANDS },
        input: { type: "object", description: "Command-specific SMART AIO input object." }
      },
      required: ["command", "input"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }
]);

export function listSmartAioMcpTools() {
  return tools;
}

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}

export async function callSmartAioMcpTool(name, args = {}) {
  if (name === "smart_aio_verify_runtime") {
    return toolResult(await runSmartAioCommand("verify", {}));
  }
  if (name === "smart_aio_select_next_approved_plan") {
    return toolResult(await runSmartAioCommand("select-next-approved-plan", args.input));
  }
  if (name === "smart_aio_run_workflow_step") {
    if (!commandSet.has(args.command)) throw new Error(`SMART_AIO_COMMAND_NOT_ALLOWED:${args.command || "(missing)"}`);
    return toolResult(await runSmartAioCommand(args.command, args.input));
  }
  throw new Error(`SMART_AIO_MCP_TOOL_NOT_FOUND:${name || "(missing)"}`);
}

export async function handleSmartAioMcpRequest(message) {
  const { id, method, params = {} } = message || {};
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params.protocolVersion || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "smart-aio-runtime", version: "1.0.0" },
        instructions: "Verify the runtime first, then run only the workflow step required by the SMART AIO skills."
      }
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: listSmartAioMcpTools() } };
  if (method === "tools/call") {
    try {
      return { jsonrpc: "2.0", id, result: await callSmartAioMcpTool(params.name, params.arguments || {}) };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
        }
      };
    }
  }
  if (typeof id === "undefined") return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method || "(missing)"}` } };
}

async function main() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let response;
    try {
      response = await handleSmartAioMcpRequest(JSON.parse(line));
    } catch (error) {
      response = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: error instanceof Error ? error.message : String(error) }
      };
    }
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
