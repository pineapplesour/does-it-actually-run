import { chromium } from '/home/pineapple/agentforge-seoul/skills/four-route-browser-verification/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport:{width:1280,height:800},
  recordVideo:{dir:'/home/pineapple/agentforge-seoul/video/raw',size:{width:1280,height:800}},
});
const p = await ctx.newPage();
await p.goto('file:///home/pineapple/agentforge-seoul/demo/index.html',{waitUntil:'networkidle'});
await p.waitForTimeout(1200);
await p.evaluate(()=>window.startDemo());
await p.waitForSelector('#rep.show',{timeout:300000});
await p.waitForTimeout(2000);
for(let i=0;i<20;i++){ await p.mouse.wheel(0,150); await p.waitForTimeout(360); }
await p.waitForTimeout(2500);
await ctx.close(); await b.close();
console.log('recording done');
