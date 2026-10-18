import {describe,it,expect} from 'vitest';
import {CAMPUSES} from '../src/campuses';
import {isExplorationBudget,resolveBudget} from '../src/budget';
import {actionCost,actionReason,addBuildingAction,createBuildingContext,emptyBuildingState,evaluateBuildingPlan,readBuildingState} from '../src/buildingPlanning';
import type {BuildingAction} from '../src/buildingPlanning';
import {compareBuildingPlans} from '../src/buildingComparison';
import {evaluateActionImpact} from '../src/buildingImpact';
import {completeMission,discoverFromPlan,emptyPlayProgress,missionStarts,planBudgetOverride,readPlayProgress} from '../src/campusPlay';

it('accepts only integer exploration budgets in range and preserves event budgets otherwise',()=>{
  for(const value of [100,101,500,999,1000]){expect(isExplorationBudget(value)).toBe(true);expect(resolveBudget('budget',value)).toBe(value);}
  for(const value of [undefined,null,'500',99,1001,100.5,NaN,Infinity,-Infinity])expect(isExplorationBudget(value)).toBe(false);
  for(const value of [undefined,99,1001,100.5,NaN,Infinity]){expect(resolveBudget('normal',value)).toBe(100);expect(resolveBudget('budget',value)).toBe(80);}
});

describe.each(Object.values(CAMPUSES))('$name exploration budgets',config=>{
  const context=createBuildingContext(config),at='2026-10-18T09:00:00.000Z';
  const shade=missionStarts(context,'shade'),actions=[...shade];
  for(const site of context.sites){
    const action:BuildingAction={buildingId:site.id,projectId:'solar'};
    const cost=actions.reduce((sum,a)=>sum+actionCost(context,a),0);
    if(cost>150)break;
    if(!actionReason(context,action,actions)&&cost+actionCost(context,action)<500)actions.push(action);
  }
  const state={...emptyBuildingState(config.id),actions,snapshot:{actions:shade,savedAt:at}};
  const free={...emptyPlayProgress(config.id),activeMission:null,explorationBudget:500};
  it('allows larger plans, while budget changes never change physical effects, scope or saved A',()=>{
    const original=JSON.stringify(state),standard=evaluateBuildingPlan(context,actions,'normal');
    expect(standard.cost).toBeGreaterThan(100);expect(standard.feasible).toBe(false);
    for(const event of ['normal','heat','rain','budget'] as const){
      const small=evaluateBuildingPlan(context,actions,event),large=evaluateBuildingPlan(context,actions,event,500);
      expect(large.budget).toBe(500);expect(large.feasible).toBe(true);expect(large.remaining).toBe(500-large.cost);
      const {budget:smallBudget,remaining:smallRemaining,feasible:smallFeasible,success:smallSuccess,...smallEffects}=small;
      const {budget:largeBudget,remaining:largeRemaining,feasible:largeFeasible,success:largeSuccess,...largeEffects}=large;
      expect(largeEffects).toEqual(smallEffects);
      expect(evaluateBuildingPlan(context,[...actions].reverse(),event,500)).toEqual(large);
    }
    expect(JSON.stringify(state)).toBe(original);
    expect(readBuildingState(original,context).actions).toEqual(actions);
    expect(readBuildingState(original,context).snapshot).toEqual(state.snapshot);
  });
  it('uses the same custom budget for purchases, previews and both comparison plans',()=>{
    const last=actions.at(-1)!,before={...state,actions:actions.slice(0,-1)};
    expect(addBuildingAction(context,before,last).error).toContain('预算不足');
    const placed=addBuildingAction(context,before,last,500);
    expect(placed.error).toBeUndefined();expect(placed.state).toEqual(state);
    const standard=evaluateActionImpact(context,before.actions,'normal',last);
    const custom=evaluateActionImpact(context,before.actions,'normal',last,'B',evaluateBuildingPlan(context,before.actions,'normal',500));
    expect(standard.overBudget).toBeGreaterThan(0);expect(custom.overBudget).toBe(0);
    const big=compareBuildingPlans(context,shade,actions,'budget',500),small=compareBuildingPlans(context,shade,actions,'budget');
    expect(big.a.budget).toBe(500);expect(big.b.budget).toBe(500);expect(big.b.feasible).toBe(true);
    expect(small.a.budget).toBe(80);expect(small.b.budget).toBe(80);expect(small.b.feasible).toBe(false);
    expect(big.buildings).toEqual(small.buildings);
  });
  it('keeps mode and per-campus budget across saves, and safely defaults legacy or invalid settings',()=>{
    expect(readPlayProgress(JSON.stringify(free),context)).toEqual(free);
    for(const value of [undefined,null,'500',99,1001,100.5])expect(readPlayProgress(JSON.stringify({...free,explorationBudget:value}),context)).toEqual({...free,explorationBudget:100});
    expect(planBudgetOverride(free)).toBe(500);
    const tasks={...free,activeMission:'cool' as const};
    expect(planBudgetOverride(tasks)).toBeUndefined();expect(planBudgetOverride({...tasks,activeMission:null})).toBe(500);
    const other=createBuildingContext(config.id==='changan'?CAMPUSES.youyi:CAMPUSES.changan);
    expect(readPlayProgress(JSON.stringify(free),other)).toEqual(emptyPlayProgress(other.config.id));
    expect(readBuildingState(JSON.stringify(state),other).actions).toEqual([]);
  });
  it('records reproducible discovery budgets but never awards task completion from exploration',()=>{
    const result=evaluateBuildingPlan(context,actions,state.event,500);
    const learned=discoverFromPlan(free,context,state,result,at);
    expect(learned.discoveries.shade?.explorationBudget).toBe(500);
    expect(readPlayProgress(JSON.stringify(learned),context)).toEqual(learned);
    expect(readPlayProgress(JSON.stringify({...learned,explorationBudget:100}),context).discoveries).toEqual(learned.discoveries);
    expect(completeMission(free,context,{...state,actions:shade},'shade',at)).toBe(free);
    const taskMode={...free,activeMission:'shade' as const};
    expect(completeMission(taskMode,context,state,'shade',at)).toBe(taskMode);
    const forged={...learned,completed:{shade:learned.discoveries.shade}};
    expect(readPlayProgress(JSON.stringify(forged),context).completed).toEqual({});
    expect(readPlayProgress(JSON.stringify({...learned,discoveries:{shade:{...learned.discoveries.shade,explorationBudget:1001}}}),context).discoveries).toEqual({});
    expect(discoverFromPlan({...free,explorationBudget:100},context,state,evaluateBuildingPlan(context,actions,'normal',100),at).discoveries).toEqual({});
    expect(discoverFromPlan(taskMode,context,state,result,at)).toBe(taskMode);
  });
});
