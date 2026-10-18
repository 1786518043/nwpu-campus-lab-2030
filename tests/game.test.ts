import {describe,it,expect} from 'vitest';
import {evaluate,PROJECTS,EVENTS,EMPTY_STATE,toggleProject,parseSaved} from '../src/game';
import type {ProjectId} from '../src/game';
describe('校园方案规则',()=>{
  it('对具体平衡方案重算事件，不把事件叠加',()=>{
    const ids:ProjectId[]=['retrofit','shuttle','walk','lighting'];
    expect(evaluate(ids,'normal')).toMatchObject({cost:100,carbon:52,comfort:86,success:true});
    expect(evaluate(ids,'heat')).toMatchObject({carbon:59,comfort:86});
    expect(evaluate(ids,'rain')).toMatchObject({carbon:52,comfort:82});
    expect(evaluate(ids,'normal').carbon).toBe(52);
  });
  it('预算缩减保留原方案但标记不可行',()=>{
    const ids:ProjectId[]=['retrofit','shuttle','walk','lighting'];
    expect(evaluate(ids,'budget')).toMatchObject({remaining:-20,feasible:false,success:false});
    expect(ids).toHaveLength(4);
  });
  it('超预算新增被拒绝，移除措施始终允许',()=>{
    const state={...EMPTY_STATE,selected:['retrofit','solar'] as ProjectId[]};
    expect(toggleProject(state,'shuttle').error).toBeTruthy();
    expect(toggleProject(state,'solar').state.selected).toEqual(['retrofit']);
    expect(state.selected).toEqual(['retrofit','solar']);
  });
  it('恢复记录拒绝重复、未知措施和损坏 JSON',()=>{
    for(const raw of ['{bad',JSON.stringify({...EMPTY_STATE,selected:['fake']}),JSON.stringify({...EMPTY_STATE,selected:['walk','walk']}),JSON.stringify({...EMPTY_STATE,snapshot:{ids:[],savedAt:7}})]) expect(parseSaved(raw)).toEqual(EMPTY_STATE);
    const state={...EMPTY_STATE,selected:['walk'],event:'rain'};
    expect(parseSaved(JSON.stringify(state))).toEqual(state);
  });
  it('枚举全部组合和事件，验证边界、贡献解释与达标条件一致',()=>{
    for(let mask=0;mask<64;mask++)for(const event of EVENTS){
      const ids=PROJECTS.filter((_,i)=>mask&(1<<i)).map(p=>p.id);
      const r=evaluate(ids,event.id);
      expect(r.comfort).toBeGreaterThanOrEqual(0);expect(r.comfort).toBeLessThanOrEqual(100);
      expect(r.carbon).toBeGreaterThanOrEqual(0);
      expect(r.remaining+r.cost).toBe(event.budget);
      expect(r.success).toBe(r.feasible&&r.carbonMet&&r.comfortMet);
      expect(r.carbon).toBe(Math.max(0,100+r.contributions.reduce((n,p)=>n+p.carbon,0)));
    }
  });
});
