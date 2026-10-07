const path=require('node:path');const fs=require('node:fs');const {randomUUID}=require('node:crypto');
const {openDatabase}=require('./database.cjs');const {registerIpc,visible}=require('./ipc.cjs');
function formatDuration(ms){const sec=Math.floor(ms/1000),min=Math.floor(sec/60);return sec<3600?(sec%60===0?`${min} 分`:`${min} 分 ${sec%60} 秒`):`${Math.floor(sec/3600)} 小时 ${min%60} 分`;}
async function createDesktopApplication({electron,dataDir,htmlPath=path.resolve(__dirname,'../index.html'),openDatabaseImpl=openDatabase,beforeOpen,onStarted}) {
 const {app,BrowserWindow,ipcMain,dialog,Notification}=electron;
 if(typeof dataDir!=='string'||!path.isAbsolute(dataDir)) throw new Error('数据目录需要绝对路径。');
 if(process.platform==='linux'&&app.commandLine&&!app.commandLine.hasSwitch('ozone-platform'))app.commandLine.appendSwitch('ozone-platform','x11');
 app.setName('TomatoClock');app.setDesktopName?.('tomatoclock.desktop');app.setPath('userData',path.join(dataDir,'electron'));
 if(!app.requestSingleInstanceLock()){app.quit();return {window:null,close:async()=>{},forceClose:()=>{}};}
 fs.mkdirSync(dataDir,{recursive:true});
 await app.whenReady();
 if(beforeOpen&&await beforeOpen())return {window:null,close:async()=>{},forceClose:()=>{}};
 let db,startupError;
 try {db=await openDatabaseImpl({filePath:path.join(dataDir,'learning.sqlite')});}catch(error){startupError=error;}
 const icon=path.resolve(__dirname,'../assets/tomatoclock.png');
 const window=new BrowserWindow({width:920,height:800,minWidth:680,minHeight:560,show:false,title:'TomatoClock',...(fs.existsSync(icon)?{icon}:{}),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
 let quitting=false,closing=null,pendingStatus=null;
 const notify=arg=>{
  if(!arg||!['work-done','break-done'].includes(arg.phase)) throw new Error('提醒阶段不正确。');
  if(arg.phase==='work-done'&&(!['short','long'].includes(arg.kind)||!Number.isSafeInteger(arg.durationMs)||arg.durationMs<60000||arg.durationMs>6780000)) throw new Error('休息时长不正确。');
  if(!Notification.isSupported()) return {sent:false};
  const options=arg.phase==='work-done'?{title:'番茄完成 🍅',body:`该休息了：${arg.kind==='long'?'长休':'短休'} ${formatDuration(arg.durationMs)}。`}:{title:'休息结束',body:'该开工了：点“开始下一个番茄”。'};
  const notice=new Notification(options);notice.on('click',()=>{if(!window.isDestroyed()){window.restore();window.show();window.focus();}});notice.show();return {sent:true};
 };
 const dispose=registerIpc({ipcMain,window,db,dialog,notify,startupError,onCloseStatus:arg=>{
  if(pendingStatus?.id===arg.requestId){const current=pendingStatus;pendingStatus=null;clearTimeout(current.timer);current.resolve(arg.pendingCount);}
 }});
 function forceClose(){
  if(quitting) return;quitting=true;
  if(pendingStatus){clearTimeout(pendingStatus.timer);pendingStatus.resolve(0);pendingStatus=null;}
  dispose();db?.close();if(!window.isDestroyed()) window.destroy();app.quit();
 }
 function requestStatus(){return new Promise((resolve,reject)=>{
  const id=randomUUID();const timer=setTimeout(()=>{if(pendingStatus?.id===id)pendingStatus=null;reject(new Error('页面暂时没有回应，尚未退出。'));},5000);
  pendingStatus={id,resolve,timer};window.webContents.send('tc:prepareClose',id);
 });}
 async function performClose(){
  while(!quitting){
   let count;
   try {count=await requestStatus();}catch(error){
    const response=await dialog.showMessageBox(window,{type:'warning',message:error.message,buttons:['取消退出','强制退出'],defaultId:0,cancelId:0});
    if(response.response===1) forceClose();return;
   }
   if(quitting) return;
   if(count===0){forceClose();return;}
   const response=await dialog.showMessageBox(window,{type:'warning',message:`还有 ${count} 条已完成的番茄记录未保存。`,detail:'重试保存可保留学习记录。',buttons:['重试保存','取消退出','放弃记录并退出'],defaultId:0,cancelId:1});
   if(response.response===2){forceClose();return;}if(response.response!==0)return;
  }
 }
 function close(){if(quitting)return Promise.resolve();if(!closing)closing=performClose().finally(()=>{closing=null;});return closing;}
 window.on('close',event=>{if(!quitting){event.preventDefault();close().catch(error=>console.error(error));}});
 window.webContents.on('render-process-gone',forceClose);
 window.webContents.on('will-navigate',event=>event.preventDefault());
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 for(const event of ['focus','blur','minimize','restore','show','hide'])window.on(event,()=>{if(!window.isDestroyed())window.webContents.send('tc:visibility',visible(window));});
 app.on('second-instance',()=>{if(!window.isDestroyed()){window.restore();window.show();window.focus();}});
 app.on('window-all-closed',forceClose);
 window.once('ready-to-show',()=>window.show());
 try {await window.loadFile(htmlPath);}catch(error){forceClose();throw error;}
 if(!startupError&&!window.isDestroyed()&&onStarted)await onStarted();
 return {window,close,forceClose};
}
async function startDesktopApplication(options){
 try {return await createDesktopApplication(options);}
 catch(error){
  console.error('TomatoClock 启动失败：',error);
  try {await options.electron.app.whenReady();options.electron.dialog.showErrorBox('番茄钟无法启动',`无法访问本地数据或启动应用。\n${error.message}`);}
  finally {options.electron.app.exit(1);}
  return null;
 }
}
module.exports={createDesktopApplication,startDesktopApplication};
