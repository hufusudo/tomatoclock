// Installed outside version directories: a broken new entry must not break recovery.
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const {readJson,readReleaseDirectory,activateRelease,atomicJson}=require(fs.existsSync(path.join(__dirname,'.bootstrap/releases.cjs'))?'./.bootstrap/releases.cjs':'./releases.cjs');
async function launchInstalled({appDir,args=[],env=process.env}){
 const config=readJson(path.join(appDir,'.tomatoclock-install.json'));
 if(config.name!=='tomatoclock'||config.format!==2)throw new Error('启动目录不属于本应用。');
 const childEnv={...env};delete childEnv.ELECTRON_RUN_AS_NODE;
 function run(){return new Promise(resolve=>{
  const child=spawn(path.join(appDir,'current/TomatoClock'),args,{env:childEnv,stdio:'inherit'});
  child.once('error',error=>{console.error('番茄钟启动失败：',error.message);resolve(1);});
  child.once('exit',code=>resolve(code??1));
 });}
 const code=await run(),pendingFile=path.join(appDir,'.pending-update.json');
 if(code===0||!fs.existsSync(pendingFile))return code;
 const pending=readJson(pendingFile),current=fs.realpathSync(path.join(appDir,'current'));
 if(current!==path.join(appDir,'versions',pending.nextId,'package'))return code;
 const previous=readReleaseDirectory(path.join(appDir,'versions'),pending.previousId);
 activateRelease(appDir,previous.id);
 atomicJson(path.join(appDir,'.failed-update.json'),{id:pending.nextId});
 atomicJson(path.join(appDir,'.recovered-update.json'),{id:pending.nextId});fs.unlinkSync(pendingFile);
 return run();
}
if(require.main===module)launchInstalled({appDir:__dirname,args:process.argv.slice(2)}).then(code=>{process.exitCode=code;}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={launchInstalled};
