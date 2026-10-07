const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {cleanupInstalled,cleanupFeed}=require('../desktop/cleanup.cjs');
const args=process.argv.slice(2),dryRun=!args.includes('--apply');
function option(name,fallback){const at=args.indexOf(name);if(at<0)return fallback;if(!args[at+1]||args[at+1].startsWith('--'))throw new Error(`${name} 需要目录路径。`);return path.resolve(args[at+1]);}
try{
 const appDir=option('--app-dir',path.join(os.homedir(),'.local/opt/tomatoclock')),feedDir=option('--feed-dir',path.resolve(__dirname,'../dist/updates'));
 const missing=dir=>({planned:[],removed:[],skipped:[{path:dir,reason:'目录不存在，无需清理。'}]});
 // Validate both targets in preview mode before applying any deletion.
 const installed=fs.existsSync(appDir)?cleanupInstalled(appDir,{dryRun:true}):missing(appDir);
 const feed=fs.existsSync(feedDir)?cleanupFeed(feedDir,{dryRun:true}):missing(feedDir);
 console.log(JSON.stringify({dryRun,installed:dryRun?installed:fs.existsSync(appDir)?cleanupInstalled(appDir):installed,feed:dryRun?feed:fs.existsSync(feedDir)?cleanupFeed(feedDir):feed},null,2));
}catch(error){console.error(`清理未执行或已暂缓：${error.message}`);process.exitCode=1;}
