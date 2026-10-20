const electron=require('electron');const path=require('node:path');
const appRoot=process.env.TOMATOCLOCK_TEST_APP_ROOT??path.resolve(__dirname,'../..');
const {createDesktopApplication}=require(path.join(appRoot,'desktop/application.cjs'));
const {openDatabase}=require(path.join(appRoot,'desktop/database.cjs'));
if(!process.env.TOMATOCLOCK_TEST_DATA_DIR)throw new Error('UI tests require an isolated data directory');
async function testDatabase(options){
 globalThis.__tcSettingsTestHook=true;
 const db=await openDatabase(options),save=db.saveSettings;
 db.saveSettings=async settings=>{if(globalThis.__tcSettingsDelay)await new Promise(resolve=>setTimeout(resolve,globalThis.__tcSettingsDelay));if(globalThis.__tcSettingsFailure)throw new Error('模拟设置写入失败');return save(settings);};
 return db;
}
createDesktopApplication({electron,dataDir:process.env.TOMATOCLOCK_TEST_DATA_DIR,htmlPath:path.join(appRoot,'index.html'),openDatabaseImpl:testDatabase}).catch(error=>{console.error(error);electron.app.exit(1);});
