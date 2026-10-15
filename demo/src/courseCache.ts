import type {Course} from './domain';
/** Course metadata refreshes must not replace an already fetched file list. */
export function mergeCourseFiles(previous:Course[],incoming:Course[]):Course[]{
  const known=new Map(previous.map(c=>[c.id,c]));
  return incoming.map(c=>{const old=known.get(c.id);return old?{...c,files:old.files,filesLoaded:old.filesLoaded,fileLoading:old.fileLoading,fileError:old.fileError}:c;});
}
