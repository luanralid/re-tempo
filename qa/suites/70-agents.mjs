// qa/suites/70-agents.mjs — full suite for the Agents / Agent Runs / software factory area + mod.
//   node run.mjs --suite 70-agents --profile qa-7        (logged in; creates/deletes QA-AUTO-agents-<runid>*)
//   node run.mjs --suite 70-agents --instances 1         (logged out: native tests become SKIP; mod runs)
// Real runs: at most 5 in total (budget in /tmp/tempo-qa/scratch-t-agents/run-budget.json).
import { nativeTests } from "./70-agents/native-tests.mjs";
import { modTests } from "./70-agents/mod-tests.mjs";

export default { name: "70-agents", tests: [...nativeTests, ...modTests] };
