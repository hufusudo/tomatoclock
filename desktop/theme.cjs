const fs=require('node:fs/promises'),{constants}=require('node:fs'),path=require('node:path'),os=require('node:os');
const limit=32768;
function themeConfigDir(env=process.env,home=os.homedir()){const base=env.XDG_CONFIG_HOME&&path.isAbsolute(env.XDG_CONFIG_HOME)?env.XDG_CONFIG_HOME:path.join(home,'.config');return path.join(base,'tomatoclock');}
function createThemeService({configDir=themeConfigDir(),templatePath,openFile}){
 if(!path.isAbsolute(configDir)||!path.isAbsolute(templatePath))throw new Error('主题目录必须是绝对路径。');
 const filePath=path.join(configDir,'custom.css');
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
 return {read,open};
}
module.exports={createThemeService,themeConfigDir};
