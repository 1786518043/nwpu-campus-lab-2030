import {describe,it,expect} from 'vitest';
import {CAMPUSES,CAMPUS_IDS,parseCampusId,storageKey} from '../src/campuses';
import {parseSaved,evaluate} from '../src/game';
import {pointInside} from '../src/mapGeometry';

describe('campus scenes and isolated progress',()=>{
  it('keeps the original Chang’an save compatible and gives Youyi a different slot',()=>{
    expect(storageKey('changan')).toBe('campus2030:green:v1');
    const saves=new Map<string,string>();
    saves.set(storageKey('changan'),JSON.stringify({version:1,selected:['solar'],event:'rain',snapshot:{ids:['solar'],savedAt:'2026-10-18'}}));
    expect(parseSaved(saves.get(storageKey('youyi'))||null).selected).toEqual([]);
    saves.set(storageKey('youyi'),JSON.stringify({version:1,selected:['walk'],event:'budget',snapshot:null}));
    expect(parseSaved(saves.get(storageKey('changan'))!).event).toBe('rain');
    expect(parseSaved(saves.get(storageKey('youyi'))!).selected).toEqual(['walk']);
    expect(parseCampusId('invalid')).toBe('changan');
  });
  it('all measure sites and tour targets resolve inside their own campus',()=>{
    for(const id of CAMPUS_IDS){
      const config=CAMPUSES[id],ids=new Set(config.data.buildings.map(b=>b.id));
      expect(ids.size).toBe(config.data.buildings.length);
      expect(config.data.buildings.length).toBe(config.data.osmBuildingCount+config.data.supplementalBuildingCount);
      for(const p of config.projects){
        expect(pointInside(p.location,config.data.boundary),`${id}: ${p.site} is outside the campus`).toBe(true);
        p.buildingIds.forEach(b=>expect(ids.has(b),`${id}: missing building ${b}`).toBe(true));
      }
      config.tours.forEach(t=>{
        if(t.buildingId)expect(ids.has(t.buildingId)).toBe(true);
        else expect(t.location&&pointInside(t.location,config.data.boundary)).toBe(true);
      });
      config.athleticsIds.forEach(g=>expect(config.data.grounds.some(f=>f.id===g)).toBe(true));
    }
  });
  it('changing the campus changes sites without altering the shared teaching rules',()=>{
    const a=CAMPUSES.changan.projects,b=CAMPUSES.youyi.projects;
    expect(a.map(p=>p.site)).not.toEqual(b.map(p=>p.site));
    for(let i=0;i<a.length;i++){
      expect([a[i].cost,a[i].carbon,a[i].comfort,a[i].heatShield,a[i].rainShield]).toEqual([b[i].cost,b[i].carbon,b[i].comfort,b[i].heatShield,b[i].rainShield]);
    }
    expect(evaluate(['retrofit','shuttle','walk','lighting'],'normal').success).toBe(true);
  });
});
