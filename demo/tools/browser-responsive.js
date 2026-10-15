await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
const checks=[];
for(const width of [600,720,768,800,1024,1366]){
  await page.setViewportSize({width,height:1000});
  await page.getByRole('button',{name:'平板',exact:true}).click();
  await expect(page.locator('.tablet-layout')).toBeVisible();
  const layout=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,contentOverflow:document.querySelector('.app-content').scrollWidth>document.querySelector('.app-content').clientWidth,nav:getComputedStyle(document.querySelector('.bottom-nav')).flexDirection}));
  assert.equal(layout.overflow,false);assert.equal(layout.contentOverflow,false);assert.equal(layout.nav,'column');checks.push(layout);
}
await page.getByRole('button',{name:'录播',exact:true}).click();
await page.getByRole('button',{name:'打开计算机网络录播',exact:true}).click();
await expect(page.getByRole('region',{name:'课堂学习资料'})).toBeVisible();
await page.getByRole('button',{name:'字幕',exact:true}).click();
await expect(page.getByRole('textbox',{name:'搜索字幕'})).toBeVisible();
const learning=await page.evaluate(()=>({columns:getComputedStyle(document.querySelector('.learning-layout')).gridTemplateColumns,overflow:document.querySelector('.app-content').scrollWidth>document.querySelector('.app-content').clientWidth}));
assert.equal(learning.overflow,false);
return {checks,learning,screenshot:await page.screenshot({fullPage:false})};
