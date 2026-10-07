const fs=require('node:fs');const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {withMaintenanceLock}=require('./maintenance-lock.cjs');
const {atomicJson,readJson,compareVersions,readRelease,readReleaseDirectory,stageRelease,activateRelease,findInstallation}=require('./releases.cjs');
function relaunch(electron,appDir){
 electron.app.relaunch({execPath:path.join(appDir,'start-tomatoclock'),args:process.argv.slice(1)});
 electron.app.exit(0);
}
async function checkLocalUpdate({electron,appRoot,dataDir}){
 const installation=findInstallation(appRoot);if(!installation)return false;
 const {appDir,config,runningId}=installation,pendingFile=path.join(appDir,'.pending-update.json');
 try{
  const recoveredFile=path.join(appDir,'.recovered-update.json');
  if(fs.existsSync(recoveredFile)){
   await electron.dialog.showMessageBox({type:'warning',title:'更新已恢复',message:'新版启动失败，已自动打开上一版。',detail:'学习记录保留，更新前的数据库备份也已保留。',buttons:['继续使用']});fs.unlinkSync(recoveredFile);
  }
  if(fs.existsSync(pendingFile)){
   const pending=readJson(pendingFile);
   if(pending.nextId===runningId){
    if(pending.attempted){
     const previous=readReleaseDirectory(path.join(appDir,'versions'),pending.previousId);
     activateRelease(appDir,previous.id);
     atomicJson(path.join(appDir,'.failed-update.json'),{id:runningId});fs.unlinkSync(pendingFile);
     await electron.dialog.showMessageBox({type:'warning',title:'更新已恢复',message:'上次新版未能完成启动，已切回上一版。',detail:'学习记录保留。如新版曾升级数据库，请保留更新前的备份供维护时检查。',buttons:['打开上一版']});
     relaunch(electron,appDir);return true;
    }
    atomicJson(pendingFile,{...pending,attempted:true});return false;
   }
   // A failed switch never commits a different current link; discard its unused journal.
   if(pending.previousId===runningId)fs.unlinkSync(pendingFile);
   else throw new Error('更新状态与当前程序不一致。');
  }
  if(typeof config.updateSource!=='string'||!path.isAbsolute(config.updateSource))return false;
  if(!fs.existsSync(path.join(config.updateSource,'latest.json')))return false;
  const release=readRelease(config.updateSource,{verify:false});
  const current=readReleaseDirectory(path.join(appDir,'versions'),runningId,{verify:false});
  if(release.id===runningId||compareVersions(release.version,current.version)<0)return false;
  const failedFile=path.join(appDir,'.failed-update.json');if(fs.existsSync(failedFile)&&readJson(failedFile).id===release.id)return false;
  const database=path.join(dataDir,'learning.sqlite');
  if(['-journal','-wal'].some(suffix=>fs.existsSync(database+suffix)))throw new Error('数据库存在待恢复的事务文件，本次暂缓更新。请让当前程序正常打开并关闭后，再尝试更新。');
  const response=await electron.dialog.showMessageBox({type:'info',title:'番茄钟有新版本',message:`发现新版本 ${release.version}`,detail:`当前版本 ${current.version}。更新完成后会重新打开应用，学习记录和设置保留。\n更新前自动备份数据库，并保留上一版程序。`,buttons:['立即更新','暂时跳过'],defaultId:0,cancelId:1,noLink:true});
  if(response.response!==0)return false;
  withMaintenanceLock(appDir,()=>{
  const staged=stageRelease(appDir,release);
  if(fs.existsSync(database)){
   if(!fs.lstatSync(database).isFile())throw new Error('数据库路径不是普通文件，更新已取消。');
   const backups=path.join(dataDir,'backups');fs.mkdirSync(backups,{recursive:true});
   fs.copyFileSync(database,path.join(backups,`before-update-${release.id.slice(0,12)}-${randomUUID()}.sqlite`),fs.constants.COPYFILE_EXCL|fs.constants.COPYFILE_FICLONE);
  }
  atomicJson(pendingFile,{format:1,previousId:runningId,nextId:release.id,attempted:false});
  try{
   activateRelease(appDir,staged.id);
  }catch(error){
   activateRelease(appDir,runningId);fs.rmSync(pendingFile,{force:true});throw error;
  }
  });
  try{relaunch(electron,appDir);return true;}catch(error){withMaintenanceLock(appDir,()=>{activateRelease(appDir,runningId);fs.rmSync(pendingFile,{force:true});});throw error;}
 }catch(error){
  await electron.dialog.showMessageBox({type:'warning',title:'更新暂时不可用',message:'本次更新未完成，将继续打开当前程序。',detail:error.message,buttons:['继续使用'],noLink:true});return false;
 }
}
function markUpdateHealthy(appRoot){
 const installation=findInstallation(appRoot);if(!installation)return;
 const file=path.join(installation.appDir,'.pending-update.json');
 if(fs.existsSync(file)){
  const pending=readJson(file);if(pending.nextId!==installation.runningId)return;
  readReleaseDirectory(path.join(installation.appDir,'versions'),pending.previousId,{verify:false});
  atomicJson(path.join(installation.appDir,'.previous-release.json'),{id:pending.previousId});fs.unlinkSync(file);
  try{require('./cleanup.cjs').cleanupInstalled(installation.appDir);}catch(error){console.warn('新版已启动，程序清理暂缓：',error.message);}
 }
}
module.exports={checkLocalUpdate,markUpdateHealthy};
