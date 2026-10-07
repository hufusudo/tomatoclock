const path=require('node:path');const {publishRelease}=require('../desktop/releases.cjs');
function publishLocal({sourceDir=path.resolve(__dirname,'../dist/TomatoClock-linux-x64'),feedDir=path.resolve(__dirname,'../dist/updates')}={}){return publishRelease({sourceDir,feedDir});}
if(require.main===module){const release=publishLocal();console.log(`已准备本地更新 ${release.version}：${release.id.slice(0,12)}`);}
module.exports={publishLocal};
