import * as basicChat from "./scenarios/basicChat";
import * as review from "./scenarios/review";
import * as toolFlows from "./scenarios/toolFlows";
import type { ScenarioTurn } from "./scenarioTypes";

export const allScenarios: ScenarioTurn[] = [
  ...basicChat.scenarios,
  ...review.scenarios,
  ...toolFlows.scenarios,
];
