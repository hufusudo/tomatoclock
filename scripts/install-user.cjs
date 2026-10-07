const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const defaultPrefix=path.join(os.homedir(),'.local');
function within(dir,parent){return dir===parent||dir.startsWith(parent+path.sep);}
function installUser({sourceDir=path.resolve(__dirname,'../dist/TomatoClock-linux-x64'),prefix=defaultPrefix,dryRun=false}={}){
 prefix=path.resolve(prefix);sourceDir=path.resolve(sourceDir);
 if(/[\r\n]/.test(prefix)||(!within(prefix,os.homedir())&&!within(prefix,os.tmpdir())))throw new Error('安装位置必须是用户目录或临时测试目录。');
 if(!fs.existsSync(path.join(sourceDir,'TomatoClock')))throw new Error('请先打包应用。');
 const appDir=path.join(prefix,'opt/tomatoclock'),marker=path.join(appDir,'.tomatoclock-install.json');
 const dataHome=prefix===defaultPrefix&&process.env.XDG_DATA_HOME&&path.isAbsolute(process.env.XDG_DATA_HOME)?process.env.XDG_DATA_HOME:path.join(prefix,'share');
 const desktopFile=path.join(dataHome,'applications/tomatoclock.desktop'),launcher=path.join(appDir,'start-tomatoclock');
 if(!within(dataHome,os.homedir())&&!within(dataHome,os.tmpdir()))throw new Error('应用菜单位置不在用户目录。');
 if(fs.existsSync(appDir)&&(!fs.existsSync(marker)||JSON.parse(fs.readFileSync(marker)).name!=='tomatoclock'))throw new Error('目标目录已有其他文件，拒绝覆盖。');
 if(fs.existsSync(desktopFile)&&!fs.readFileSync(desktopFile,'utf8').includes('X-TomatoClock-Managed=true'))throw new Error('同名菜单入口不属于本应用，拒绝覆盖。');
 const result={appDir,desktopFile,launcher};if(dryRun)return result;
 fs.mkdirSync(appDir,{recursive:true});fs.cpSync(sourceDir,appDir,{recursive:true,force:true,mode:fs.constants.COPYFILE_FICLONE});
 fs.writeFileSync(marker,JSON.stringify({name:'tomatoclock',version:JSON.parse(fs.readFileSync(path.join(appDir,'resources/app/package.json'))).version}));
 fs.mkdirSync(path.dirname(desktopFile),{recursive:true});
 const exec=launcher.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/%/g,'%%');
 fs.writeFileSync(desktopFile,`[Desktop Entry]\nType=Application\nName=番茄钟\nComment=本地学习记录与番茄计时\nExec="${exec}"\nIcon=${path.join(appDir,'resources/app/assets/tomatoclock.png')}\nTerminal=false\nCategories=Education;Utility;\nStartupWMClass=TomatoClock\nX-TomatoClock-Managed=true\n`,{mode:0o644});
 return result;
}
if(require.main===module){const args=process.argv.slice(2),at=args.indexOf('--prefix');console.log(JSON.stringify(installUser({prefix:at>=0?args[at+1]:defaultPrefix,dryRun:args.includes('--dry-run')}),null,2));}
module.exports={installUser};
