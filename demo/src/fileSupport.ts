import type { CourseFile } from './domain';
const textFormats=new Set('pdf docx ppt pptx pptm xlsx xlsm odt odp ods txt md csv json yaml yml py c cpp h hpp rs js ts tsx jsx java ipynb tex latex xml html htm log rst srt vtt sql m r toml ini'.split(' '));
export function fileQuestionSupport(file:CourseFile):{supported:boolean;reason?:string}{
  const extension=(file.name.split('.').pop()||'').toLowerCase();
  if(!textFormats.has(extension))return {supported:false,reason:'此格式暂不支持文字提取'};
  const size=Number(file.raw?.size||0);if(size>256*1024*1024)return {supported:false,reason:'资料超过本机读取容量，请按章节拆分'};
  return {supported:true};
}
