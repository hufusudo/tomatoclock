const visible=window=>!window.isDestroyed()&&window.isVisible()&&!window.isMinimized()&&window.isFocused();
function registerIpc({ipcMain,window,db,dialog,notify,onCloseStatus=()=>{},startupError=null}) {
 const channels=[];
 function bind(name,action){const channel=`tc:${name}`;channels.push(channel);ipcMain.handle(channel,async(event,arg)=>{
  try {
   if(window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame) throw Object.assign(new Error('请求来源不允许。'),{code:'UNAUTHORIZED'});
   return {ok:true,value:await action(arg)};
  } catch(error){return {ok:false,error:{code:error.code??'OPERATION_FAILED',message:error.message??'操作失败。'}};}
 });}
 const requireDb=()=>{if(!db) throw Object.assign(new Error(startupError?.message??'学习数据库无法打开。'),{code:'DATABASE_UNAVAILABLE'});return db;};
 for(const name of ['getSettings','saveSettings','saveCompletedPomodoro','getSummary','listDaily']) bind(name,arg=>requireDb()[name](arg));
 bind('getVisibility',()=>visible(window));
 bind('notifyPhase',arg=>notify(arg));
 bind('closeStatus',arg=>{
  if(!arg||typeof arg.requestId!=='string'||!Number.isSafeInteger(arg.pendingCount)||arg.pendingCount<0) throw new Error('退出状态不正确。');
  onCloseStatus(arg);return true;
 });
 return ()=>channels.forEach(channel=>ipcMain.removeHandler(channel));
}
module.exports={registerIpc,visible};
