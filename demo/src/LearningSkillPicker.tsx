import {useState} from 'react';
import {Check,ChevronRight,GraduationCap,Sparkles} from 'lucide-react';
import {Modal} from './Modal';
import {learningSkills,skillId,learningSystemRules} from './learningSkills';
export function LearningSkillPicker({value,onChange,onClose}:{value:unknown;onChange:(id:string)=>void;onClose:()=>void}){
 const [preview,setPreview]=useState(skillId(value));const skill=learningSkills.find(s=>s.id===preview);
 return <Modal title="学习 skill" subtitle="选择怎么学，也可以交给 AI 自动判断" wide className="learning-skill-modal" onClose={onClose}>
  <div className="learning-skill-layout"><div className="learning-skill-list" aria-label="学习方式">
   <button aria-pressed={preview==='auto'} onClick={()=>setPreview('auto')}><Sparkles size={18}/><span><strong>自动选择</strong><small>按当前问题切换，不用每次手动选</small></span>{preview==='auto'?<Check size={16}/>:<ChevronRight size={16}/>}</button>
   {learningSkills.map(s=><button key={s.id} aria-pressed={preview===s.id} onClick={()=>setPreview(s.id)}><GraduationCap size={18}/><span><strong>{s.title}</strong><small>{s.description}</small></span>{preview===s.id?<Check size={16}/>:<ChevronRight size={16}/>}</button>)}
  </div><section className="learning-skill-preview" aria-label="学习 skill 预览"><small>学习方式预览</small><h3>{skill?.title||'自动选择'}</h3><p>{skill?.when||'当前有疑问就直接解释；想自己想就给提示；提供了自己的理解就检查；想复习时再进入回忆或总结。你的明确要求始终优先。'}</p>
   <div className="learning-skill-example"><strong>可以这样问</strong><p>{skill?.example||'这一步为什么成立？我没弄懂里面的条件。'}</p></div>
   <details key={preview}><summary>提示词预览</summary><p className="learning-skill-prompt">{skill?.prompt||'按本轮问题选择一种主要教学方式，默认直接讲清楚。不增加额外模型请求。文件阅读、来源核对和连续对话规则始终生效。'}</p></details>
   <details><summary>通用教学与资料规则</summary><p className="learning-skill-prompt">{learningSystemRules}</p></details>
   {!!skill?.sources.length&&<details key={preview+'-sources'}><summary>教学依据</summary>{skill.sources.map(url=><a key={url} href={url} target="_blank" rel="noreferrer">{url.includes('ies.ed.gov')?'IES 学习与记忆实践指南':url.endsWith('feedback')?'EEF 有效反馈指南':'EEF 元认知与学习支架指南'}</a>)}<p>研究支持教学策略；实际学习效果还需要结合你的使用验证。</p></details>}
  </section></div><footer className="learning-skill-footer"><span>仅改变这段对话的后续回答，保留现有资料与草稿</span><button className="button primary" onClick={()=>{onChange(preview);onClose()}}><Check size={16}/>使用{skill?.title||'自动选择'}</button></footer>
 </Modal>;
}
