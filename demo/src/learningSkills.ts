import catalog from './learningSkills.json';
import baseRules from './learningBase.md?raw';
export const learningSkills=catalog.skills;
export const learningSkillVersion=catalog.version;
export const learningSystemRules=baseRules;
export interface CustomLearningSkill {id:string;title:string;description:string;when:string;example:string;prompt:string;triggers:string[];sources:string[]}
const customKey=(scope:string)=>`canvas-custom-learning-skills-v1:${scope}`;
export function loadCustomSkills(scope='preview'):CustomLearningSkill[]{try{const value=JSON.parse(localStorage.getItem(customKey(scope))||'[]');return Array.isArray(value)?value.filter(s=>s&&typeof s.id==='string'&&s.id.startsWith('custom-')&&typeof s.title==='string'&&typeof s.prompt==='string'):[]}catch{return[]}}
export function saveCustomSkills(scope:string,skills:CustomLearningSkill[]){try{localStorage.setItem(customKey(scope),JSON.stringify(skills.slice(0,24)));}catch{/* Keep the current session usable when storage is unavailable. */}}
export function resolveLearningSkill(value:unknown,scope='preview'){const id=skillId(value);return learningSkills.find(s=>s.id===id)||loadCustomSkills(scope).find(s=>s.id===id)}
export function skillId(value:unknown){if(value==='none')return 'none';return typeof value==='string'&&(learningSkills.some(s=>s.id===value)||value.startsWith('custom-'))?value:'auto'}
export function automaticSkill(question:string){return learningSkills.find(s=>s.triggers.some(t=>question.toLowerCase().includes(t)))||learningSkills.find(s=>s.id==='explain')!}
export function skillLabel(value:unknown){if(skillId(value)==='none')return '关闭 Skill';return learningSkills.find(s=>s.id===skillId(value))?.title||'自定义 Skill'}
