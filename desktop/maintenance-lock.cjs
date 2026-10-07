const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
function busy(){const error=new Error('另一个维护任务正在运行或锁归属无法确认，本次暂缓。');error.code='TC_MAINTENANCE_BUSY';return error;}
function owner(dir){
 if(!fs.lstatSync(dir).isDirectory())throw busy();
 const file=path.join(dir,'owner.json'),info=fs.lstatSync(file);if(!info.isFile()||info.size>4096)throw busy();
 const value=JSON.parse(fs.readFileSync(file,'utf8'));
 if(value.name!=='tomatoclock-maintenance'||!Number.isSafeInteger(value.pid)||value.pid<=0||typeof value.token!=='string')throw busy();return value;
}
function dead(pid){try{process.kill(pid,0);return false;}catch(error){return error.code==='ESRCH';}}
function withMaintenanceLock(base,operation){
 const dir=path.join(base,'.tc-maintenance-lock'),token=randomUUID();
 function acquire(){
  try{fs.mkdirSync(dir);}catch(error){
   if(error.code!=='EEXIST')throw error;
   let prior;try{prior=owner(dir);}catch{throw busy();}if(!dead(prior.pid))throw busy();
   // An exclusive reaper prevents two processes from removing/replacing the same stale lock.
   const claim=path.join(dir,'.reap');let fd,removed=false;
   try{
    fd=fs.openSync(claim,'wx',0o600);const now=owner(dir);
    if(now.token!==prior.token||!dead(now.pid)||fs.readdirSync(dir).some(name=>!['owner.json','.reap'].includes(name)))throw busy();
    fs.rmSync(dir,{recursive:true});removed=true;
   }catch{throw busy();}finally{
    if(fd!==undefined){
     if(!removed){try{const original=fs.fstatSync(fd),current=fs.lstatSync(claim);if(original.ino===current.ino&&original.dev===current.dev)fs.unlinkSync(claim);}catch{}}
     fs.closeSync(fd);
    }
   }
   fs.mkdirSync(dir);
  }
  try{fs.writeFileSync(path.join(dir,'owner.json'),JSON.stringify({name:'tomatoclock-maintenance',pid:process.pid,token}),{flag:'wx',mode:0o600});}catch(error){fs.rmSync(dir,{recursive:true,force:true});throw error;}
 }
 acquire();
 try{return operation();}finally{if(owner(dir).token===token)fs.rmSync(dir,{recursive:true});}
}
module.exports={withMaintenanceLock};
