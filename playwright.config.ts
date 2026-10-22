import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir:'./tests/browser',
  workers:1,
  timeout:60000,
  use:{
    baseURL:process.env.GATEWAY_TEST_URL||(process.env.GATEWAY_PREVIEW?'http://127.0.0.1:4174/gateway/':'http://127.0.0.1:5174'),
    channel:process.platform==='win32'?'msedge':undefined,
    headless:true,
    viewport:{width:1440,height:900},
    launchOptions:{args:['--use-angle=swiftshader','--enable-webgl']},
  },
  reporter:'list',
  webServer:process.env.GATEWAY_TEST_URL?undefined:{command:process.env.GATEWAY_PREVIEW?'node scripts/serve-production.mjs':'npm run dev -- --port 5174',url:process.env.GATEWAY_PREVIEW?'http://127.0.0.1:4174/gateway/':'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI},
})
