import {useEffect,useState} from 'react';
import {EXPLORATION_BUDGET_MIN,EXPLORATION_BUDGET_MAX,isExplorationBudget} from './budget';

export default function ExplorationBudget({value,onApply}:{value:number;onApply:(value:number)=>void}){
  const [draft,setDraft]=useState(String(value)),[error,setError]=useState('');
  useEffect(()=>{setDraft(String(value));setError('');},[value]);
  return <form className="exploration-budget" aria-label="自由探索预算" noValidate onSubmit={e=>{
    e.preventDefault();
    const amount=Number(draft);
    if(!/^\d+$/.test(draft)||!isExplorationBudget(amount)){setError('请输入 100–1000 之间的整数建设点。');return;}
    setError('');setDraft(String(amount));onApply(amount);
  }}>
    <div><label htmlFor="exploration-budget">自由探索预算</label><p id="exploration-budget-help">100–1000 建设点 · A/B 共同使用。修改后点击应用。</p></div>
    <div className="exploration-budget-controls"><input id="exploration-budget" type="number" inputMode="numeric" min={EXPLORATION_BUDGET_MIN} max={EXPLORATION_BUDGET_MAX} step="1" value={draft} aria-invalid={!!error} aria-describedby={`exploration-budget-help${error?' exploration-budget-error':''}`} onChange={e=>{setDraft(e.target.value);setError('');}}/><button type="submit" className="primary-button" disabled={draft===String(value)}>应用预算</button><span>当前共同预算 <strong>{value}</strong> 点</span></div>
    {error&&<p id="exploration-budget-error" className="bad" role="alert">{error}</p>}
    <p className="exploration-budget-note">所有情境均使用手动预算，包括“预算收紧”。继续任务会恢复 100 点（预算收紧为 80 点）；已有布局与 A 保留，超支时不能保存为可行方案或提交任务。探索模式不记录任务通关。</p>
  </form>;
}
