import {execFileSync,spawnSync} from 'node:child_process';
import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {preview} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),port=4173;
const specified=args.find(a=>a.startsWith('--host='))?.slice(7);
let host=specified;
if(!host&&process.platform==='win32'){
  try{
    host=execFileSync('powershell.exe',['-NoProfile','-Command',
      "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Sort-Object { $_.NetIPv4Interface.InterfaceMetric } | ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1"
    ],{encoding:'utf8',windowsHide:true}).trim();
  }catch{ /* A manual interface address can be provided below. */ }
}
const addresses=Object.values(networkInterfaces()).flat().filter(a=>a?.family==='IPv4'&&!a.internal);
if(!host||!addresses.some(a=>a.address===host)){
  console.error('未找到可用的局域网地址。请连接 Wi-Fi，或运行 node scripts/preview-phone.mjs --host=电脑的局域网IPv4地址。');
  process.exit(1);
}
if(!args.includes('--skip-build')){
  for(const [entry,...extra] of [['typescript/bin/tsc','-b'],['vite/bin/vite.js','build']]){
    const result=spawnSync(process.execPath,[path.join(root,'node_modules',entry),...extra],{cwd:root,stdio:'inherit',windowsHide:true});
    if(result.status!==0)process.exit(result.status||1);
  }
}
try{
  // Serve the built static app on the selected Wi-Fi/Ethernet address only.
  // Do not expose Vite's development source server or other network adapters.
  const server=await preview({root,configFile:false,build:{outDir:'dist'},preview:{host,port,strictPort:true,cors:false}});
  console.log(`\n手机预览已启动：http://${host}:${port}/`);
  console.log('手机与电脑须连接同一 Wi-Fi；手机不要使用 127.0.0.1。');
  console.log('请保持电脑和本窗口运行；按 Ctrl+C 停止。切换网络后重新运行本脚本。');
  console.log('若手机无法连接，请检查 Windows 防火墙是否允许当前局域网访问 TCP 4173，以及路由器是否开启访客隔离。\n');
  const stop=()=>server.httpServer.close(()=>process.exit(0));
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}catch(error){
  console.error(`手机预览启动失败：${error.message}`);
  process.exit(1);
}
