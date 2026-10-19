import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {normalizeMath,RichAnswer} from './RichAnswer';
it('normalizes one-line display formulas while preserving literal formulas in code',()=>{
  const text='解释：$$x^2 + y^2 = z^2$$\n\n`$$do not render$$`\n\n```tex\n$$keep$$\n```';
  const html=renderToStaticMarkup(<RichAnswer text={text}/>);expect(html).toContain('katex-display');expect(html).toContain('do not render');expect(html).toContain('$$keep$$');expect(normalizeMath('\\[x^2\\]')).toContain('$$\nx^2\n$$');
});
