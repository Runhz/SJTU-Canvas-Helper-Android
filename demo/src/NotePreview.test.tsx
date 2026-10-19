import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {RichAnswer} from './RichAnswer';
import {noteHtml,noteFilename} from './NotePreview';
it('keeps Unicode filenames within filesystem byte limits and strips reserved characters',()=>{
  for(const title of ['中文😀'.repeat(100),'\u0000:*?<>|/\\标题.  ','...']){const name=noteFilename(title,'html');expect(new TextEncoder().encode(name).length).toBeLessThan(200);expect(name).not.toMatch(/[\\/:*?"<>|\x00-\x1f\x7f]/);expect(name).toMatch(/\.html$/);expect(name).not.toContain('\uFFFD')}
  expect(noteFilename('...','md')).toBe('学习笔记.md');
});
it('exports offline MathML, tables and code without scripts, remote fonts or duplicate KaTeX visual layers',()=>{
  const root=document.createElement('div');root.innerHTML=renderToStaticMarkup(<RichAnswer text={'公式 $x^2$\n\n|信号|结果|\n|---|---|\n|$f_s$|采样|\n\n```js\nconst x = 1\n```'}/>);
  const html=noteHtml({id:'n',scope:'s',courseId:'',title:'<script>标题</script>',body:'',updatedAt:0},root),doc=new DOMParser().parseFromString(html,'text/html');expect(doc.querySelector('math')).toBeTruthy();expect(doc.querySelector('table')).toBeTruthy();expect(doc.querySelector('pre')?.textContent).toContain('const x = 1');expect(doc.querySelector('script')).toBeNull();expect(doc.querySelector('.katex-html')).toBeNull();expect(doc.querySelector('link')).toBeNull();expect(doc.title).toBe('<script>标题</script>');expect(doc.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("default-src 'none'");
});
