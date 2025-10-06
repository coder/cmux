import * as basicChat from "./scenarios/basicChat";
import * as review from "./scenarios/review";
import type { ScenarioTurn } from "./scenarioTypes";

export const allScenarios: ScenarioTurn[] = [...basicChat.scenarios, ...review.scenarios];
