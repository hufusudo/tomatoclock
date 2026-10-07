const electron=require('electron');const os=require('node:os');const path=require('node:path');
const {startDesktopApplication}=require('./application.cjs');
const dataHome=process.env.XDG_DATA_HOME&&path.isAbsolute(process.env.XDG_DATA_HOME)?process.env.XDG_DATA_HOME:path.join(os.homedir(),'.local','share');
startDesktopApplication({electron,dataDir:path.join(dataHome,'tomatoclock')}).catch(error=>{console.error('TomatoClock 启动失败：',error);electron.app.exit(1);});
