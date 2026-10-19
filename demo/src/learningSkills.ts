import catalog from './learningSkills.json';
import baseRules from './learningBase.md?raw';
export const learningSkills=catalog.skills;
export const learningSkillVersion=catalog.version;
export const learningSystemRules=baseRules;
export function skillId(value:unknown){return typeof value==='string'&&learningSkills.some(s=>s.id===value)?value:'auto'}
export function automaticSkill(question:string){return learningSkills.find(s=>s.triggers.some(t=>question.toLowerCase().includes(t)))||learningSkills.find(s=>s.id==='explain')!}
export function skillLabel(value:unknown){return learningSkills.find(s=>s.id===skillId(value))?.title||'自动选择'}
