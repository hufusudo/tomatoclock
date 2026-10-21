const fs=require('node:fs/promises'),{constants}=require('node:fs'),path=require('node:path'),os=require('node:os');
const limit=32768;
const selectionFormat='tomatoclock-theme-selection-v1',selectionIds=new Set(['default','paper','instrument','terminal','custom']);
function themeConfigDir(env=process.env,home=os.homedir()){const base=env.XDG_CONFIG_HOME&&path.isAbsolute(env.XDG_CONFIG_HOME)?env.XDG_CONFIG_HOME:path.join(home,'.config');return path.join(base,'tomatoclock');}
function createThemeService({configDir=themeConfigDir(),templatePath,openFile}){
 if(!path.isAbsolute(configDir)||!path.isAbsolute(templatePath))throw new Error('主题目录必须是绝对路径。');
 const filePath=path.join(configDir,'custom.css');
 const selectionPath=path.join(configDir,'theme-selection.json');let selectionWrites=Promise.resolve();
 async function readFile(file){
  const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new Error('主题文件必须是普通文件，不能是链接或目录。');
  const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try{const stat=await handle.stat();if(!stat.isFile())throw new Error('主题文件必须是普通文件。');if(stat.size>limit)throw new Error('主题文件过大（最多32 KiB）。');const buffer=Buffer.alloc(limit+1);let used=0;while(used<buffer.length){const {bytesRead}=await handle.read(buffer,used,buffer.length-used,used);if(!bytesRead)break;used+=bytesRead;}if(used>limit)throw new Error('主题文件过大（最多32 KiB）。');return buffer.subarray(0,used).toString('utf8');}finally{await handle.close();}
 }
 async function read(){try{return {css:await readFile(filePath),exists:true,filePath};}catch(error){if(error.code!=='ENOENT')throw error;return {css:await readFile(templatePath),exists:false,filePath};}}
 async function open(){
  const initial=await read();if(!initial.exists){await fs.mkdir(configDir,{recursive:true});let handle;
   try{handle=await fs.open(filePath,'wx',0o600);await handle.writeFile(initial.css,'utf8');}catch(error){if(error.code!=='EEXIST')throw error;}finally{if(handle)await handle.close();}
  }
  await read();const error=await openFile(filePath);if(error)throw new Error(`无法打开主题文件：${error}`);return {filePath};
 }
 async function readSelection(){
  let info;try{info=await fs.lstat(selectionPath);}catch(error){if(error.code==='ENOENT')return {id:null};throw error;}
  if(!info.isFile()||info.isSymbolicLink())throw new Error('主题选择文件必须是普通文件，不能是链接或目录。');
  const handle=await fs.open(selectionPath,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  let raw;try{const stat=await handle.stat();if(!stat.isFile())throw new Error('主题选择文件必须是普通文件。');if(stat.size>limit)throw new Error('主题选择文件过大。');const buffer=Buffer.alloc(limit+1);let used=0;while(used<buffer.length){const {bytesRead}=await handle.read(buffer,used,buffer.length-used,used);if(!bytesRead)break;used+=bytesRead;}if(used>limit)throw new Error('主题选择文件过大。');raw=buffer.subarray(0,used).toString('utf8');}finally{await handle.close();}
  let value;try{value=JSON.parse(raw);}catch{throw new Error('主题选择文件格式无效。');}
  if(!value||value.format!==selectionFormat||!selectionIds.has(value.id)||Object.keys(value).length!==2)throw new Error('主题选择文件内容无效。');
  return {id:value.id};
 }
 async function getSelection(){return readSelection();}
 function select(id){
  if(typeof id!=='string'||!selectionIds.has(id))return Promise.reject(new Error('内置主题选择无效。'));
  const operation=selectionWrites.then(async()=>{
   await fs.mkdir(configDir,{recursive:true});let original=null;
   try{original=await fs.lstat(selectionPath);if(!original.isFile()||original.isSymbolicLink())throw new Error('主题选择文件必须是普通文件，不能是链接或目录。');if(original.size>limit)throw new Error('主题选择文件过大。');await readSelection();}catch(error){if(error.code!=='ENOENT')throw error;}
   const temp=path.join(configDir,`.theme-selection-${process.pid}-${require('node:crypto').randomUUID()}.tmp`),payload=JSON.stringify({format:selectionFormat,id});let handle;
   try{
    handle=await fs.open(temp,'wx',0o600);await handle.writeFile(payload,'utf8');await handle.sync();await handle.close();handle=null;
    if(!original){await fs.link(temp,selectionPath);}
    else{const current=await fs.lstat(selectionPath);if(!current.isFile()||current.isSymbolicLink()||current.dev!==original.dev||current.ino!==original.ino||current.size!==original.size||current.mtimeMs!==original.mtimeMs)throw new Error('主题选择文件在保存期间发生变化，已保留原文件。');await fs.rename(temp,selectionPath);}
   }finally{if(handle)await handle.close();await fs.rm(temp,{force:true});}
   return {id};
  });selectionWrites=operation.catch(()=>{});return operation;
 }
 return {read,open,getSelection,select};
}
module.exports={createThemeService,themeConfigDir};
