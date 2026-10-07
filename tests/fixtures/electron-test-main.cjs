const electron=require('electron');const path=require('node:path');
const appRoot=process.env.TOMATOCLOCK_TEST_APP_ROOT??path.resolve(__dirname,'../..');
const {createDesktopApplication}=require(path.join(appRoot,'desktop/application.cjs'));
if(!process.env.TOMATOCLOCK_TEST_DATA_DIR)throw new Error('UI tests require an isolated data directory');
createDesktopApplication({electron,dataDir:process.env.TOMATOCLOCK_TEST_DATA_DIR,htmlPath:path.join(appRoot,'index.html')}).catch(error=>{console.error(error);electron.app.exit(1);});
