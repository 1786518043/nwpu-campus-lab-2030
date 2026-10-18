import {EVENTS} from './game';
import type {EventId} from './game';

export const EXPLORATION_BUDGET_MIN=100;
export const EXPLORATION_BUDGET_MAX=1000;
export const DEFAULT_EXPLORATION_BUDGET=100;
export const isExplorationBudget=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=EXPLORATION_BUDGET_MIN&&value<=EXPLORATION_BUDGET_MAX;
/** In exploration the user's amount is the actual budget, for every event.
 * Without a valid override, the original mission budget remains unchanged. */
export const resolveBudget=(event:EventId,explorationBudget?:number)=>isExplorationBudget(explorationBudget)?explorationBudget:EVENTS.find(e=>e.id===event)!.budget;
