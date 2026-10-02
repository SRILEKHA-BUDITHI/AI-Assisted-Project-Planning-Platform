/** Starter prompts shown before the first question. */
export const ASSISTANT_SUGGESTIONS = [
  'Summarize project risks',
  'Why is the budget at risk?',
  'Suggest missing deliverables',
  'Explain the optimization result',
] as const

/**
 * Placeholder replies for the NirnAIn AI panel. There is no AI endpoint in the
 * backend yet; replace this with a call through `src/lib/api.ts` once it exists.
 * Replies describe what the assistant will do and never invent project data.
 */
export function getAssistantReply(question: string, context: string): string {
  const q = question.toLowerCase()
  if (q.includes('risk')) {
    return 'Once AI analysis is connected, I will rank the open risks on this project by impact and suggest mitigations tied to the affected work packages. Until then, risks extracted during AI Project Intake appear in Scope Review.'
  }
  if (q.includes('budget') || q.includes('cost')) {
    return 'I will compare planned and committed spend and point out which constraints drive the gap. For now, the planned budget is on the Dashboard and budget limits are set in Constraints.'
  }
  if (q.includes('deliverable') || q.includes('wbs')) {
    return 'I will check the work breakdown for missing deliverables, such as testing, rollout or disaster recovery, and propose work packages for you to approve. Use AI Validate in the WBS Builder to review structure issues.'
  }
  if (q.includes('optim') || q.includes('scenario')) {
    return 'I will explain how each optimization scenario trades cost, schedule and utilization, and which constraints make a scenario infeasible. Run the optimizer from Constraints to compare scenarios.'
  }
  if (q.includes('constraint')) {
    return 'I will explain which hard constraints (budget ceiling, deadline) and soft constraints (skill match, capacity) limit the plan, and which ones to relax first.'
  }
  return `I can help with the ${context} step. Try asking about risks, budget, missing deliverables or constraints.`
}
