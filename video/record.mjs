import { chromium } from '/home/pineapple/agentforge-seoul/skills/four-route-browser-verification/node_modules/playwright/index.mjs';

const OUT = '/home/pineapple/agentforge-seoul/video/raw';
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  deviceScaleFactor: 1,
});
const p = await ctx.newPage();
const wait = (ms) => p.waitForTimeout(ms);

await p.goto('http://localhost:8899', { waitUntil: 'networkidle', timeout: 60000 });
await wait(2500);

// 1) 언어 선택
console.log('step: language');
await p.getByRole('button', { name: /한국어/ }).click();
await wait(2500);

// 2) 레포 주소 입력 (한 글자씩 타이핑되는 느낌)
console.log('step: type repo');
const box = p.locator('input[type="text"]').first();
await box.click();
await box.fill('');
await box.type('https://github.com/psf/requests', { delay: 55 });
await wait(1200);

// 3) 검증 시작
console.log('step: verify');
await p.getByRole('button', { name: '검증', exact: true }).click();

// 4) 완료까지 대기하며 진행 화면을 그대로 녹화
console.log('step: waiting for report');
await p.waitForSelector('text=/검증 완료/', { timeout: 480000 });
await wait(2500);

// 5) 보고서 천천히 스크롤
console.log('step: scroll report');
for (let i = 0; i < 14; i++) {
  await p.mouse.wheel(0, 190);
  await wait(420);
}
await wait(2500);

await ctx.close();
await b.close();
console.log('recording done');
