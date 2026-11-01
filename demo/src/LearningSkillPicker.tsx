import {useState} from 'react';
import {Check,ChevronRight,GraduationCap,Plus,Sparkles,Trash2,X} from 'lucide-react';
import {Modal} from './Modal';
import {learningSkills,loadCustomSkills,saveCustomSkills,skillId,learningSystemRules,type CustomLearningSkill} from './learningSkills';
export function LearningSkillPicker({value,onChange,onClose,scope='preview'}:{value:unknown;onChange:(id:string)=>void;onClose:()=>void;scope?:string}){
 const [custom,setCustom]=useState<CustomLearningSkill[]>(()=>loadCustomSkills(scope));const [preview,setPreview]=useState(skillId(value));const [creating,setCreating]=useState(false);const [title,setTitle]=useState('');const [prompt,setPrompt]=useState('');const skill=learningSkills.find(s=>s.id===preview)||custom.find(s=>s.id===preview);
 function add(){const cleanTitle=title.trim(),cleanPrompt=prompt.trim();if(!cleanTitle||!cleanPrompt)return;const next=[...custom,{id:`custom-${Date.now()}`,title:cleanTitle,description:'自定义回答规则',when:'只在你选择这个 Skill 的对话中生效。',example:'按我写的规则处理当前问题。',prompt:cleanPrompt,triggers:[],sources:[]}];setCustom(next);saveCustomSkills(scope,next);setPreview(next[next.length-1].id);setTitle('');setPrompt('');setCreating(false)}
 function remove(id:string){const next=custom.filter(s=>s.id!==id);setCustom(next);saveCustomSkills(scope,next);if(preview===id)setPreview('auto')}
 return <Modal title="学习 skill" subtitle="选择怎么学，也可以交给 AI 自动判断" wide className="learning-skill-modal" onClose={onClose}>
  <div className="learning-skill-layout"><div className="learning-skill-list" aria-label="学习方式">
   <button aria-pressed={preview==='none'} onClick={()=>setPreview('none')}><X size={18}/><span><strong>关闭 Skill</strong><small>只使用资料与对话上下文，不套用教学方式</small></span>{preview==='none'?<Check size={16}/>:<ChevronRight size={16}/>}</button>
   <button aria-pressed={preview==='auto'} onClick={()=>setPreview('auto')}><Sparkles size={18}/><span><strong>自动选择</strong><small>按当前问题切换，不用每次手动选</small></span>{preview==='auto'?<Check size={16}/>:<ChevronRight size={16}/>}</button>
   {learningSkills.map(s=><button key={s.id} aria-pressed={preview===s.id} onClick={()=>setPreview(s.id)}><GraduationCap size={18}/><span><strong>{s.title}</strong><small>{s.description}</small></span>{preview===s.id?<Check size={16}/>:<ChevronRight size={16}/>}</button>)}
   {custom.map(s=><button key={s.id} aria-pressed={preview===s.id} onClick={()=>setPreview(s.id)}><Sparkles size={18}/><span><strong>{s.title}</strong><small>{s.description}</small></span><span className="skill-custom-actions">{preview===s.id&&<Check size={16}/>}<Trash2 size={14} onClick={e=>{e.stopPropagation();remove(s.id)}}/></span></button>)}
   <button className="skill-add" onClick={()=>setCreating(true)}><Plus size={18}/><span><strong>添加自定义 Skill</strong><small>写一段你自己的回答规则</small></span><ChevronRight size={16}/></button>
  </div><section className="learning-skill-preview" aria-label="学习 skill 预览"><small>学习方式预览</small><h3>{skill?.title||'自动选择'}</h3><p>{skill?.when||'当前有疑问就直接解释；想自己想就给提示；提供了自己的理解就检查；想复习时再进入回忆或总结。你的明确要求始终优先。'}</p>
   <div className="learning-skill-example"><strong>可以这样问</strong><p>{skill?.example||'这一步为什么成立？我没弄懂里面的条件。'}</p></div>
   <details key={preview}><summary>提示词预览</summary><p className="learning-skill-prompt">{skill?.prompt||'按本轮问题选择一种主要教学方式，默认直接讲清楚。不增加额外模型请求。文件阅读、来源核对和连续对话规则始终生效。'}</p></details>
   <details><summary>通用教学与资料规则</summary><p className="learning-skill-prompt">{learningSystemRules}</p></details>
   {!!skill?.sources.length&&<details key={preview+'-sources'}><summary>教学依据</summary>{skill.sources.map(url=><a key={url} href={url} target="_blank" rel="noreferrer">{url.includes('ies.ed.gov')?'IES 学习与记忆实践指南':url.endsWith('feedback')?'EEF 有效反馈指南':'EEF 元认知与学习支架指南'}</a>)}<p>研究支持教学策略；实际学习效果还需要结合你的使用验证。</p></details>}
  </section></div>{creating&&<div className="skill-create-form"><label>名称<input value={title} maxLength={30} onChange={e=>setTitle(e.target.value)} placeholder="例如：像老师一样检查公式"/></label><label>规则<textarea value={prompt} maxLength={4000} onChange={e=>setPrompt(e.target.value)} placeholder="写清楚回答时要遵循什么规则"/></label><div><button className="button secondary" onClick={()=>setCreating(false)}>取消</button><button className="button primary" disabled={!title.trim()||!prompt.trim()} onClick={add}>保存 Skill</button></div></div>}<footer className="learning-skill-footer"><span>仅改变这段对话的后续回答，保留现有资料与草稿</span><button className="button primary" onClick={()=>{onChange(preview);onClose()}}><Check size={16}/>使用{preview==='none'?'关闭 Skill':skill?.title||'自动选择'}</button></footer>
 </Modal>;
}
