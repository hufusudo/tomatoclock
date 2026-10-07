const {EventEmitter}=require('node:events');
class FakeWindow extends EventEmitter {
 constructor(options){super();this.options=options;this.visible=true;this.focused=true;this.minimized=false;this.destroyed=false;this.sent=[];
  this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=(...args)=>this.sent.push(args);
  this.webContents.setWindowOpenHandler=handler=>{this.openHandler=handler;};
 }
 isVisible(){return this.visible;}isFocused(){return this.focused;}isMinimized(){return this.minimized;}isDestroyed(){return this.destroyed;}
 show(){this.visible=true;this.emit('show');}focus(){this.focused=true;this.emit('focus');}restore(){this.minimized=false;this.emit('restore');}
 destroy(){this.destroyed=true;this.emit('closed');}async loadFile(file){this.loaded=file;}
}
function fakeElectron(){
 const app=new EventEmitter();app.quits=0;app.quit=()=>{app.quits++;};app.whenReady=async()=>{};app.requestSingleInstanceLock=()=>true;app.setName=()=>{};app.setPath=()=>{};
 const handlers=new Map();const ipcMain={handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name)};
 const dialog={showMessageBox:async()=>({response:1}),showOpenDialog:async()=>({canceled:true})};
 const notes=[];class Notification extends EventEmitter {static isSupported(){return true;}constructor(options){super();notes.push(this);this.options=options;}show(){this.shown=true;}}
 return {app,ipcMain,dialog,BrowserWindow:FakeWindow,Notification,handlers,notes};
}
const source=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
module.exports={FakeWindow,fakeElectron,source};
