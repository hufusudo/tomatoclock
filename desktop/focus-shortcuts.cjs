const fs=require('node:fs/promises');const {constants}=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
const marker='tomatoclock-focus-shortcuts-v1';const limit=4096;
function isMissing(error){return error?.code==='ENOENT';}
async function normalize(raw){return (await import('../js/focus-shortcuts.js')).normalizeFocusShortcuts(raw);}
function createFocusShortcutsService({configDir}){
 if(typeof configDir!=='string'||!path.isAbsolute(configDir))throw new Error('配置目录必须是绝对路径。');
 const filePath=path.join(configDir,'focus-shortcuts.json');let queue=Promise.resolve();
 function serialized(action){const run=queue.then(action,action);queue=run.then(()=>undefined,()=>undefined);return run;}
 async function read(){
  let handle;
  try{
   const info=await fs.lstat(filePath);if(!info.isFile()||info.isSymbolicLink())throw new Error('专注快捷项文件必须是普通文件。');
   handle=await fs.open(filePath,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
   const stat=await handle.stat();if(!stat.isFile()||stat.size>limit)throw new Error('专注快捷项文件过大或无效。');
   const buffer=Buffer.alloc(limit+1);let used=0;while(used<buffer.length){const {bytesRead}=await handle.read(buffer,used,buffer.length-used,used);if(!bytesRead)break;used+=bytesRead;}
   if(used>limit)throw new Error('专注快捷项文件过大。');
   let parsed;try{parsed=JSON.parse(buffer.subarray(0,used).toString('utf8'));}catch{throw new Error('专注快捷项文件格式无效。');}
   if(!parsed||parsed.format!==marker)throw new Error('专注快捷项文件归属未知，未覆盖。');
   return await normalize(parsed.shortcuts);
  }catch(error){if(isMissing(error))return null;throw error;}
  finally{if(handle)await handle.close();}
 }
 async function write(shortcuts){
  await fs.mkdir(configDir,{recursive:true});const before=await read();
  const payload=Buffer.from(JSON.stringify({format:marker,shortcuts}));const temp=path.join(configDir,`.focus-shortcuts-${randomUUID()}.tmp`);let handle;
  try{
   handle=await fs.open(temp,'wx',0o600);await handle.writeFile(payload);await handle.sync();await handle.close();handle=null;
   const current=await read();
   if(before===null){if(current!==null)throw new Error('专注快捷项文件已出现，未覆盖。');await fs.link(temp,filePath);}
   else {if(!current||JSON.stringify(current)!==JSON.stringify(before))throw new Error('专注快捷项文件在写入期间发生变化，未覆盖。');await fs.rename(temp,filePath);}
  }finally{if(handle)await handle.close().catch(()=>{});await fs.unlink(temp).catch(error=>{if(!isMissing(error))throw error;});}
 }
 return {get:()=>serialized(async()=>(await read())??[null,null,null]),save:raw=>serialized(async()=>{const shortcuts=await normalize(raw);await write(shortcuts);return shortcuts;})};
}
module.exports={createFocusShortcutsService};
