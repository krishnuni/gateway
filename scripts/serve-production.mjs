// A deliberately small local server to verify deployment under /gateway/.
// The published application itself is static and has no server dependency.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
const root=resolve('dist'),prefix='/gateway/'
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff'}
createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
    if(!path.startsWith(prefix)){res.writeHead(404);res.end();return}
    const file=resolve(root,path.slice(prefix.length)||'index.html')
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return}
    const content=await readFile(file)
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});res.end(content)
  }catch{res.writeHead(404);res.end()}
}).listen(4174,'127.0.0.1',()=>console.log('Production preview: http://127.0.0.1:4174/gateway/'))
