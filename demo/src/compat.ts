// Chromium 74 is still shipped on some Android 10 devices. Syntax transpilation
// does not provide new built-ins used by the Markdown/math dependencies.
const objectConstructor=Object as typeof Object&{hasOwn?:(value:unknown,key:PropertyKey)=>boolean};
if(typeof objectConstructor.hasOwn!=='function'){
  Object.defineProperty(Object,'hasOwn',{configurable:true,writable:true,value:(value:unknown,key:PropertyKey)=>Object.prototype.hasOwnProperty.call(value,key)});
}

// Early Android WebViews understand grid gap but ignore flex gap. Feature-test
// layout rather than browser versions, and remove the probe before first paint.
if (document.body) {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px;';
  for (let i = 0; i < 2; i++) {
    const child = document.createElement('div'); child.style.height = '1px'; probe.appendChild(child);
  }
  document.body.appendChild(probe);
  document.documentElement.classList.toggle('no-flex-gap', probe.scrollHeight !== 3);
  probe.remove();
}
