// Cleanup is deliberately limited to verified generated program releases.
// Learning data, backups, legacy flat installs and user files are outside this boundary.
const fs=require('node:fs');const path=require('node:path');
const {readJson,readReleaseDirectory}=require('./releases.cjs');
const {withMaintenanceLock}=require('./maintenance-lock.cjs');
const ID=/^[a-f0-9]{64}$/,STAGING=/^\.staging-[a-f0-9-]{36}$/;
function directory(dir){if(!fs.lstatSync(dir).isDirectory())throw new Error('清理目录不能是链接或其他文件。');}
function pinnedId(appDir,link){
 if(!fs.lstatSync(link).isSymbolicLink())throw new Error('受保护的启动入口不正确。');
 const relative=path.relative(path.join(appDir,'versions'),fs.realpathSync(link)).split(path.sep);
 if(relative.length!==2||!ID.test(relative[0])||relative[1]!=='package')throw new Error('受保护的程序不在本应用版本目录内。');
 readReleaseDirectory(path.join(appDir,'versions'),relative[0],{verify:false});return relative[0];
}
function prune(releasesDir,keep,{dryRun=false}={}){
 directory(releasesDir);const result={planned:[],removed:[],skipped:[]};
 for(const name of fs.readdirSync(releasesDir).sort()){
  const dir=path.join(releasesDir,name);if(keep.has(name))continue;
  try{
   directory(dir);
   if(ID.test(name)){
    // A user note added beside or inside the package makes it ineligible for deletion.
    if(fs.readdirSync(dir).sort().join(',')!=='manifest.json,package')throw new Error('包含额外文件。');
    const release=readReleaseDirectory(releasesDir,name);noExtraDirectories(release.packageDir,release.manifest.files);
   }else if(STAGING.test(name)){
    const owner=readJson(path.join(dir,'.stage-owner.json'));
    if(owner.name!=='tomatoclock-stage'||owner.format!==1||!Number.isSafeInteger(owner.pid)||owner.pid<=0)throw new Error('无法确认临时文件归属。');
    try{process.kill(owner.pid,0);throw new Error('临时任务仍在运行。');}catch(error){if(error.code!=='ESRCH')throw error;}
    if(fs.readdirSync(dir).some(file=>!['package','manifest.json','.stage-owner.json'].includes(file)))throw new Error('临时目录包含额外文件。');
   }else throw new Error('不是本应用生成的版本。');
   result.planned.push(dir);
   if(!dryRun){fs.rmSync(dir,{recursive:true});result.removed.push(dir);}
  }catch(error){result.skipped.push({path:dir,reason:error.message});}
 }
 return result;
}
function noExtraDirectories(packageDir,files){
 const expected=new Set();for(const file of files){let parent=path.posix.dirname(file.path);while(parent!=='.'){expected.add(parent);parent=path.posix.dirname(parent);}}
 function walk(relative){for(const name of fs.readdirSync(path.join(packageDir,relative))){const next=relative?`${relative}/${name}`:name;if(fs.lstatSync(path.join(packageDir,next)).isDirectory()){if(!expected.has(next))throw new Error('包含额外目录。');walk(next);}}}walk('');
}
function protectRunning(appDir,keep){
 for(const pid of fs.readdirSync('/proc').filter(name=>/^\d+$/.test(name))){
  try{
   if(fs.statSync(`/proc/${pid}`).uid!==process.getuid())continue;let exe;
   try{exe=fs.readlinkSync(`/proc/${pid}/exe`);}catch(error){
    if(error.code==='ENOENT')continue;
    if(!['EACCES','EPERM'].includes(error.code))throw error;
    exe=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0')[0];
    if(exe.startsWith(appDir+path.sep)&&!exe.startsWith(path.join(appDir,'versions')+path.sep))throw new Error('运行中程序路径无法确认，暂不清理。');
   }
   const parts=path.relative(path.join(appDir,'versions'),exe).split(path.sep);if(parts.length===3&&ID.test(parts[0])&&parts[1]==='package'&&parts[2]==='TomatoClock')keep.add(parts[0]);
  }catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')continue;throw error;}
 }
}
function coordinated(base,operation){
 try{return withMaintenanceLock(base,operation);}catch(error){if(error.code!=='TC_MAINTENANCE_BUSY')throw error;return {planned:[],removed:[],skipped:[{path:base,reason:error.message}]};}
}
function installedUnlocked(appDir,options){
 directory(appDir);const marker=readJson(path.join(appDir,'.tomatoclock-install.json'));
 if(marker.name!=='tomatoclock'||marker.format!==2)throw new Error('安装目录不属于本应用。');
 if(fs.existsSync(path.join(appDir,'.pending-update.json')))return {planned:[],removed:[],skipped:[{path:appDir,reason:'更新尚未完成，暂不清理。'}]};
 const keep=new Set([pinnedId(appDir,path.join(appDir,'current')),pinnedId(appDir,path.join(appDir,'.bootstrap/runtime'))]);
 const previous=path.join(appDir,'.previous-release.json');
 if(fs.existsSync(previous)){
  const id=readJson(previous).id;readReleaseDirectory(path.join(appDir,'versions'),id,{verify:false});keep.add(id);
 }
 protectRunning(appDir,keep);
 return prune(path.join(appDir,'versions'),keep,options);
}
function feedUnlocked(feedDir,options){
 directory(feedDir);const latest=readJson(path.join(feedDir,'latest.json'));
 if(latest.format!==1)throw new Error('更新目录格式不正确。');
 const releasesDir=path.join(feedDir,'releases');readReleaseDirectory(releasesDir,latest.id,{verify:false});const keep=new Set([latest.id]);
 if(latest.previousId){readReleaseDirectory(releasesDir,latest.previousId,{verify:false});keep.add(latest.previousId);}
 return prune(releasesDir,keep,options);
}
function cleanupInstalled(appDir,options){directory(appDir);return coordinated(appDir,()=>installedUnlocked(appDir,options));}
function cleanupFeed(feedDir,options){directory(feedDir);return coordinated(feedDir,()=>feedUnlocked(feedDir,options));}
module.exports={cleanupInstalled,cleanupFeed};
