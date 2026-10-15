await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
await page.getByRole('button',{name:'手机',exact:true}).click();
const checks=[];
for(const width of [360,393,600]){
  await page.setViewportSize({width,height:852});
  await expect(page.locator('.app-shell')).toBeVisible();
  const layout=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,contentOverflow:document.querySelector('.app-content').scrollWidth>document.querySelector('.app-content').clientWidth,nav:getComputedStyle(document.querySelector('.bottom-nav')).flexDirection}));
  assert.equal(layout.overflow,false);assert.equal(layout.contentOverflow,false);assert.equal(layout.nav,'row');checks.push(layout);
}
await page.setViewportSize({width:393,height:852});
return {checks,screenshot:await page.screenshot({fullPage:false})};
