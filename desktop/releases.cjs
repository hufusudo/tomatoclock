// Local, immutable Linux releases. Only the `current` symlink changes on update.
const fs=require('node:fs');const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {withMaintenanceLock}=require('./maintenance-lock.cjs');
const ID=/^[a-f0-9]{64}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function versionParts(value){
 if(typeof value!=='string'||!/^\d+\.\d+\.\d+$/.test(value))throw new Error('更新版本格式不正确。');
 const parts=value.split('.').map(Number);if(parts.some(n=>!Number.isSafeInteger(n)))throw new Error('更新版本太大。');return parts;
}
function compareVersions(a,b){const aa=versionParts(a),bb=versionParts(b);for(let i=0;i<3;i++)if(aa[i]!==bb[i])return aa[i]>bb[i]?1:-1;return 0;}
function plainDirectory(dir){if(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink())throw new Error('更新目录不允许链接或特殊文件。');}
function atomicJson(file,value){
 const temp=path.join(path.dirname(file),`.tc-json-${randomUUID()}`);
 try{fs.writeFileSync(temp,JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}finally{fs.rmSync(temp,{force:true});}
}
function readJson(file){
 const info=fs.lstatSync(file);if(!info.isFile()||info.size>2*1024*1024)throw new Error('更新说明文件不正确。');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function inventory(dir){
 plainDirectory(dir);const files=[];let bytes=0;
 function walk(relative){
  for(const name of fs.readdirSync(path.join(dir,relative)).sort()){
   const nameInPackage=relative?`${relative}/${name}`:name,file=path.join(dir,nameInPackage),info=fs.lstatSync(file);
   if(info.isDirectory())walk(nameInPackage);
   else if(info.isFile()){
    bytes+=info.size;if(files.length>=4096||info.size>512*1024*1024||bytes>2*1024*1024*1024)throw new Error('更新包超过本地更新大小限制。');
    files.push({path:nameInPackage,size:info.size,mode:info.mode&0o111?0o755:0o644,sha256:sha(fs.readFileSync(file))});
   }else throw new Error('更新包不允许链接或特殊文件。');
  }
 }
 walk('');return files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function validateManifest(manifest){
 if(!manifest||manifest.format!==1||manifest.name!=='tomatoclock'||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>4096)throw new Error('更新说明不完整。');
 versionParts(manifest.version);const seen=new Set();let total=0;
 for(const file of manifest.files){
  if(!file||typeof file.path!=='string'||file.path.includes('\\')||file.path.includes('\0')||file.path.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(file.path)||!Number.isSafeInteger(file.size)||file.size<0||file.size>512*1024*1024||![0o644,0o755].includes(file.mode)||!ID.test(file.sha256))throw new Error('更新文件路径或校验信息不正确。');
  seen.add(file.path);total+=file.size;
 }
 if(total>2*1024*1024*1024||!seen.has('TomatoClock')||!seen.has('resources/app/desktop/main.cjs')||!seen.has('resources/app/package.json'))throw new Error('更新程序不完整。');
}
function verifyPackage(packageDir,manifest){
 validateManifest(manifest);const actual=inventory(packageDir);
 if(JSON.stringify(actual)!==JSON.stringify(manifest.files))throw new Error('更新包完整性校验失败，原程序已保留。');
 const meta=readJson(path.join(packageDir,'resources/app/package.json'));
 if(meta.name!=='tomatoclock'||meta.version!==manifest.version||!actual.find(f=>f.path==='TomatoClock'&&f.mode===0o755))throw new Error('更新程序或版本校验失败。');
}
function readReleaseDirectory(releasesDir,id,{verify=true}={}){
 if(!ID.test(id))throw new Error('更新标识不正确。');plainDirectory(releasesDir);
 const releaseDir=path.join(releasesDir,id);plainDirectory(releaseDir);
 const manifestFile=path.join(releaseDir,'manifest.json'),manifest=readJson(manifestFile);validateManifest(manifest);
 if(sha(fs.readFileSync(manifestFile))!==id)throw new Error('更新说明校验失败。');
 const packageDir=path.join(releaseDir,'package');plainDirectory(packageDir);
 if(verify)verifyPackage(packageDir,manifest);
 return {id,version:manifest.version,manifest,packageDir,releaseDir};
}
function writeRelease({sourceDir,releasesDir}){
 const meta=readJson(path.join(sourceDir,'resources/app/package.json'));versionParts(meta.version);
 const manifest={format:1,name:'tomatoclock',version:meta.version,files:inventory(sourceDir)};validateManifest(manifest);
 if(meta.name!=='tomatoclock')throw new Error('更新包不属于番茄钟。');
 const raw=JSON.stringify(manifest)+'\n',id=sha(raw);
 fs.mkdirSync(releasesDir,{recursive:true});plainDirectory(releasesDir);
 if(fs.existsSync(path.join(releasesDir,id)))return readReleaseDirectory(releasesDir,id);
 const staging=path.join(releasesDir,`.staging-${randomUUID()}`);fs.mkdirSync(staging);
 try{
  atomicJson(path.join(staging,'.stage-owner.json'),{name:'tomatoclock-stage',format:1,pid:process.pid});
  const packageDir=path.join(staging,'package');fs.cpSync(sourceDir,packageDir,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
  verifyPackage(packageDir,manifest);fs.writeFileSync(path.join(staging,'manifest.json'),raw);
  fs.unlinkSync(path.join(staging,'.stage-owner.json'));
  fs.renameSync(staging,path.join(releasesDir,id));
 }finally{fs.rmSync(staging,{recursive:true,force:true});}
 return {id,version:manifest.version,manifest,packageDir:path.join(releasesDir,id,'package'),releaseDir:path.join(releasesDir,id)};
}
function publishRelease({sourceDir,feedDir}){
 fs.mkdirSync(feedDir,{recursive:true});plainDirectory(feedDir);
 const release=withMaintenanceLock(feedDir,()=>{
 const latestFile=path.join(feedDir,'latest.json');let previous;
 if(fs.existsSync(latestFile))previous=readJson(latestFile);
 const release=writeRelease({sourceDir,releasesDir:path.join(feedDir,'releases')});
 const previousId=previous?.id===release.id?previous.previousId:previous?.id;
 atomicJson(latestFile,{format:1,id:release.id,...(previousId?{previousId}:{})});
 return release;
 });
 try{require('./cleanup.cjs').cleanupFeed(feedDir);}catch(error){console.warn('本地更新已公布，旧包清理暂缓：',error.message);}
 return release;
}
function readRelease(feedDir,options){
 plainDirectory(feedDir);const latest=readJson(path.join(feedDir,'latest.json'));if(latest.format!==1)throw new Error('更新目录格式不正确。');
 return readReleaseDirectory(path.join(feedDir,'releases'),latest.id,options);
}
function stageRelease(appDir,release){
 // Recalculate the snapshot after copying, so a changing source cannot install partial code.
 const staged=writeRelease({sourceDir:release.packageDir,releasesDir:path.join(appDir,'versions')});
 if(staged.id!==release.id)throw new Error('更新包在复制时发生变化，原程序已保留。');return staged;
}
function activateRelease(appDir,id){
 readReleaseDirectory(path.join(appDir,'versions'),id,{verify:false});
 const current=path.join(appDir,'current');
 try{if(!fs.lstatSync(current).isSymbolicLink())throw new Error('启动入口不是本应用管理的链接。');}catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=path.join(appDir,`.current-${randomUUID()}`);
 try{fs.symlinkSync(`versions/${id}/package`,temporary);fs.renameSync(temporary,current);}finally{fs.rmSync(temporary,{force:true});}
 return path.join(appDir,'versions',id,'package');
}
function findInstallation(appRoot){
 const resolved=fs.realpathSync(appRoot),appDir=path.resolve(resolved,'../../../../..'),marker=path.join(appDir,'.tomatoclock-install.json');
 if(!fs.existsSync(marker))return null;
 const config=readJson(marker);if(config.name!=='tomatoclock'||config.format!==2)return null;
 const relative=path.relative(path.join(appDir,'versions'),resolved).split(path.sep);
 if(relative.length!==4||!ID.test(relative[0])||relative.slice(1).join('/')!=='package/resources/app')return null;
 return {appDir,config,runningId:relative[0]};
}
module.exports={atomicJson,readJson,compareVersions,writeRelease,publishRelease,readRelease,readReleaseDirectory,stageRelease,activateRelease,findInstallation};
