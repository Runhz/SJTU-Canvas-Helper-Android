await page.setViewportSize({width:1280,height:960});
await page.getByRole('button',{name:'平板',exact:true}).click();
await expect(page.locator('.tablet-layout')).toBeVisible();
const result=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.dashboard-layout')).gridTemplateColumns,navDirection:getComputedStyle(document.querySelector('.bottom-nav')).flexDirection}));
assert.equal(result.overflow,false);assert.equal(result.navDirection,'column');
return {layout:result,screenshot:await page.screenshot({fullPage:false})};
