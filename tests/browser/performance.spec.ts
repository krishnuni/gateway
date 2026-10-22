import {test,expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('record rendering separately after all geometry is computed',async({page,browser})=>{
  await page.goto('./?profile=1')
  await page.getByRole('button',{name:'Explore Jupiter’s gateway'}).click()
  await expect(page.locator('main')).toHaveAttribute('data-complete','true',{timeout:30000})
  await page.waitForTimeout(1800)
  const result=await page.evaluate(async()=>{
    performance.clearMeasures('gateway.render.submit')
    const frame:number[]=[];let last=performance.now()
    await new Promise<void>(resolve=>{
      const sample=(t:number)=>{frame.push(t-last);last=t;if(frame.length<180)requestAnimationFrame(sample);else resolve()}
      requestAnimationFrame(sample)
    })
    return {frame:frame.slice(1),submit:performance.getEntriesByName('gateway.render.submit').map(e=>e.duration),dpr:devicePixelRatio,
      viewport:[innerWidth,innerHeight],userAgent:navigator.userAgent}
  })
  const summary=(a:number[])=>{const s=[...a].sort((a,b)=>a-b);return {median:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],samples:s.length}}
  expect(result.submit.length).toBeGreaterThan(30)
  await writeFile('docs/render-benchmark.json',JSON.stringify({recorded:new Date().toISOString(),browser:browser.version(),
    renderer:'SwiftShader software WebGL for repeatable automated QA; not a hardware GPU benchmark',
    fixture:'Sun–Jupiter L1, default 64 phases × 4 branches, horizon 8 TU, paused, all geometry computed',
    ...result,frameSummary:summary(result.frame),cpuSubmissionSummary:summary(result.submit)},null,2)+'\n')
})
