await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
return await tabbit.observe({ frames: 'none', maxChars: 6500 });
