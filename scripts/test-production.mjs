import { spawnSync } from 'node:child_process'
const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test'],{
  stdio:'inherit',env:{...process.env,GATEWAY_PREVIEW:'1',GATEWAY_TEST_URL:''},
})
process.exit(result.status??1)
