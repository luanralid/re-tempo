// qa/suites/70-agents-mod.mjs — only the "Agent Runs" mod (feature/agent-runs-panel.js).
// Logged out (ephemeral): node run.mjs --suite 70-agents-mod --instances 1
// Logged in:            node run.mjs --suite 70-agents-mod --profile qa-7
// Read-only (queries). Mod bugs show up as BUG-MOD-xx checks.
import { modTests } from "./70-agents/mod-tests.mjs";

export default { name: "70-agents-mod", tests: modTests };
