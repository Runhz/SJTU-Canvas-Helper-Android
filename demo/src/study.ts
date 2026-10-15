import type { Assignment, Course } from './domain';

export interface StudyPreferences {
  term: string;
  ignoredAssignments: string[];
  hiddenAssignments: string[];
  hiddenCourses: string[];
  pinnedCourses: string[];
}
export const defaultStudy = (): StudyPreferences => ({term:'current',ignoredAssignments:[],hiddenAssignments:[],hiddenCourses:[],pinnedCourses:[]});
export function studyPreferences(value?:Partial<StudyPreferences>):StudyPreferences {
  const list=(v:unknown)=>Array.isArray(v)?v.filter((s):s is string=>typeof s==='string'):[];
  return {term:typeof value?.term==='string'?value.term:'current',ignoredAssignments:list(value?.ignoredAssignments),hiddenAssignments:list(value?.hiddenAssignments),hiddenCourses:list(value?.hiddenCourses),pinnedCourses:list(value?.pinnedCourses)};
}
export const termId=(course:Course)=>course.term?.id||'unknown';
export function academicTerm(now:number){
  const date=new Date(now+8*3600_000),year=date.getUTCFullYear(),month=date.getUTCMonth()+1;
  return {year:month>=8?year:year-1,season:month>=8?'fall':month>=2?(month>=7?'summer':'spring'):'fall'};
}
export function termMatchesCurrent(course:Course,now:number){
  const term=course.term;if(!term)return false;
  if(term.startAt&&term.endAt)return term.startAt<=now&&now<=term.endAt;
  const {year,season}=academicTerm(now);
  const label=term.name.toLowerCase().replace(/\s/g,'');
  const years=label.match(/(20\d{2})[-_/—–至]*(20\d{2})?/);
  if(!years)return false;
  const first=Number(years[1]);
  const part=/秋|fall|autumn|第?[一1]学期/.test(label)||/20\d{2}[-_/]20\d{2}[-_/]1$/.test(label)?'fall':/春|spring|第?[二2]学期/.test(label)||/20\d{2}[-_/]20\d{2}[-_/]2$/.test(label)?'spring':/夏|summer|第?[三3]学期/.test(label)||/20\d{2}[-_/]20\d{2}[-_/]3$/.test(label)?'summer':'';
  return part===season&&(years[2]?first===year:first===(season==='fall'?year:year+1));
}
export function coursesForTerm(courses:Course[],selection:string,now:number){
  if(selection==='all')return courses;
  if(selection==='current')return courses.filter(c=>termMatchesCurrent(c,now));
  return courses.filter(c=>termId(c)===selection);
}
export function termOptions(courses:Course[]){
  const terms=new Map<string,string>();courses.forEach(c=>terms.set(termId(c),c.term?.name||'学期未标注'));
  return [...terms].sort((a,b)=>b[1].localeCompare(a[1],'zh-CN',{numeric:true}));
}
export function reminderScope(assignments:Assignment[],courses:Course[],prefs:StudyPreferences,now:number){
  const ids=new Set(coursesForTerm(courses,prefs.term,now).filter(c=>!prefs.hiddenCourses.includes(c.id)).map(c=>c.id));
  return assignments.filter(a=>ids.has(a.courseId)&&!prefs.ignoredAssignments.includes(a.id)&&!prefs.hiddenAssignments.includes(a.id));
}
export function updateStudy(prefs:StudyPreferences,kind:'assignment'|'course',id:string,action:'ignore'|'hide'|'restore'):StudyPreferences{
  if(kind==='course')return {...prefs,hiddenCourses:action==='restore'?prefs.hiddenCourses.filter(v=>v!==id):Array.from(new Set([...prefs.hiddenCourses,id]))};
  if(action==='restore')return {...prefs,ignoredAssignments:prefs.ignoredAssignments.filter(v=>v!==id),hiddenAssignments:prefs.hiddenAssignments.filter(v=>v!==id)};
  const key=action==='ignore'?'ignoredAssignments':'hiddenAssignments';
  return {...prefs,[key]:Array.from(new Set([...prefs[key],id]))};
}
export interface SubtitleLine {bg:number;ed:number;res:string}
export function subtitleTime(ms:number,srt=false){
  const value=Math.max(0,Math.floor(Number.isFinite(ms)?ms:0));
  const time=[Math.floor(value/3600000),Math.floor(value/60000)%60,Math.floor(value/1000)%60].map(v=>String(v).padStart(2,'0')).join(':');
  return srt?`${time},${String(value%1000).padStart(3,'0')}`:time;
}
export function subtitleExport(lines:SubtitleLine[],format:'srt'|'txt'){
  return lines.map((line,i)=>format==='srt'?`${i+1}\n${subtitleTime(line.bg,true)} --> ${subtitleTime(Math.max(line.bg+1,line.ed||lines[i+1]?.bg||line.bg+3000),true)}\n${line.res}\n`:`[${subtitleTime(line.bg)}] ${line.res}`).join('\n');
}
