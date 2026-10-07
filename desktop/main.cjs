const electron=require('electron');const os=require('node:os');const path=require('node:path');
const {startDesktopApplication}=require('./application.cjs');
const {checkLocalUpdate,markUpdateHealthy}=require('./local-update.cjs');
const dataHome=process.env.XDG_DATA_HOME&&path.isAbsolute(process.env.XDG_DATA_HOME)?process.env.XDG_DATA_HOME:path.join(os.homedir(),'.local','share');
const dataDir=path.join(dataHome,'tomatoclock'),appRoot=path.resolve(__dirname,'..');
startDesktopApplication({electron,dataDir,beforeOpen:()=>checkLocalUpdate({electron,appRoot,dataDir}),onStarted:()=>markUpdateHealthy(appRoot)}).catch(error=>{console.error('TomatoClock 启动失败：',error);electron.app.exit(1);});
