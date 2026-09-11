const PROTECTED_PATHS = Object.freeze([
  "references/content-v1/prompts.json",
]);

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function planSkillDesign(input = {}) {
  const workflow = Array.isArray(input.workflow_steps) ? input.workflow_steps : [];
  if (!workflow.length) throw new Error("WORKFLOW_STEPS_REQUIRED");
  return Object.freeze({
    skill_name: requireText(input.skill_name, "skill_name"),
    business_goal: requireText(input.business_goal, "business_goal"),
    workflow_steps: workflow,
    required_inputs: unique(input.required_inputs || []),
    required_outputs: unique(input.required_outputs || []),
    evaluation_criteria: unique(input.evaluation_criteria || []),
    stop_conditions: unique(input.stop_conditions || []),
    test_scenarios: input.test_scenarios || [],
    versioning_policy: "PROPOSAL_REVIEW_APPROVAL_RELEASE",
  });
}

export function evaluateSkillDefinition(input = {}) {
  const required = ["skill_name", "description", "workflow_steps", "required_inputs", "required_outputs", "evaluation_criteria", "stop_conditions"];
  const missing = required.filter((key) => {
    const value = input[key];
    return Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim();
  });
  const contradictions = input.contradictions || [];
  const ambiguousInstructions = input.ambiguous_instructions || [];
  return Object.freeze({
    skill_name: requireText(input.skill_name, "skill_name"),
    result: missing.length || contradictions.length || ambiguousInstructions.length ? "REVISE" : "PASS",
    missing_sections: missing,
    contradictions,
    ambiguous_instructions: ambiguousInstructions,
    release_allowed: missing.length === 0 && contradictions.length === 0 && ambiguousInstructions.length === 0,
  });
}

export function evaluateSkillRun(input = {}) {
  const expected = input.expected_checkpoints || [];
  const actual = input.actual_checkpoints || [];
  const actualKeys = new Set(actual.filter((item) => item.status === "PASS").map((item) => item.key));
  const failedCheckpoints = expected.filter((item) => !actualKeys.has(item.key));
  const reviewIssues = input.review_issues || [];
  return Object.freeze({
    skill_name: requireText(input.skill_name, "skill_name"),
    run_id: requireText(input.run_id, "run_id"),
    result: failedCheckpoints.length || reviewIssues.length ? "REVISE" : "PASS",
    failed_checkpoints: failedCheckpoints,
    review_issues: reviewIssues,
    failure_stage: failedCheckpoints[0]?.stage || reviewIssues[0]?.stage || null,
  });
}

function isProtectedPath(path) {
  const normalized = String(path || "").replaceAll("\\", "/");
  return PROTECTED_PATHS.some((protectedPath) => normalized.includes(protectedPath));
}

export function buildSkillChangeProposal(input = {}) {
  const changes = (input.proposed_changes || []).map((change) => ({
    path: requireText(change.path, "proposed_changes.path"),
    reason: requireText(change.reason, "proposed_changes.reason"),
    change_type: change.change_type || "EDIT",
    prompt_value_integrity: change.prompt_value_integrity || null,
  }));
  const protectedChanges = changes.filter((change) => isProtectedPath(change.path) && change.prompt_value_integrity !== "SHA256_UNCHANGED");
  return Object.freeze({
    proposal_id: requireText(input.proposal_id, "proposal_id"),
    skill_name: requireText(input.skill_name, "skill_name"),
    current_version: requireText(input.current_version, "current_version"),
    source_run_ids: unique(input.source_run_ids || []),
    proposed_changes: changes,
    protected_changes: protectedChanges,
    status: protectedChanges.length ? "BLOCKED_PROTECTED_CONTENT" : "PENDING_ADMIN_APPROVAL",
    applies_automatically: false,
    requires_admin_approval: true,
    protected_prompt_values_must_remain_unchanged: true,
  });
}

export function curateSkillFeedback(input = {}) {
  const minimumOccurrences = Number(input.minimum_occurrences || 2);
  const counts = new Map();
  for (const item of input.feedback || []) {
    const key = `${item.skill_name || input.skill_name}|${item.stage || "GENERAL"}|${item.rule || item.issue || ""}`;
    const current = counts.get(key) || { count: 0, sample: item };
    current.count += 1;
    counts.set(key, current);
  }
  const reusableRules = [...counts.values()]
    .filter((item) => item.count >= minimumOccurrences && (item.sample.rule || item.sample.issue))
    .map((item) => ({
      skill_name: item.sample.skill_name || input.skill_name,
      stage: item.sample.stage || "GENERAL",
      rule: item.sample.rule || item.sample.issue,
      occurrences: item.count,
      proposed_only: true,
    }));
  return Object.freeze({
    skill_name: requireText(input.skill_name, "skill_name"),
    reusable_rules: reusableRules,
    status: reusableRules.length ? "CHANGE_PROPOSAL_READY" : "INSUFFICIENT_REPEATED_EVIDENCE",
    applies_automatically: false,
  });
}

export function authorizeSkillChange(proposal, approval = {}) {
  if (proposal?.status !== "PENDING_ADMIN_APPROVAL") throw new Error("CHANGE_PROPOSAL_NOT_APPROVABLE");
  if (approval.approval_status !== "APPROVED" || !["admin", "owner"].includes(String(approval.approver_role || "").toLowerCase())) {
    throw new Error("ADMIN_APPROVAL_REQUIRED");
  }
  if (String(approval.proposal_id || "") !== proposal.proposal_id) throw new Error("CHANGE_PROPOSAL_SCOPE_MISMATCH");
  return Object.freeze({
    ...proposal,
    status: "APPROVED_FOR_VERSIONED_RELEASE",
    approved_by: approval.approver_user_id,
    approved_at: approval.approved_at,
    next_step: "管理者が差分を確認し、テスト合格後に新バージョンとして公開する",
  });
}
