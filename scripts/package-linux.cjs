const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
function buildPackage(){
 if(process.platform!=='linux'||process.arch!=='x64')throw new Error('当前打包配置面向 Linux x64。');
 const out=path.join(root,'dist/TomatoClock-linux-x64'),marker=path.join(out,'.tomatoclock-package.json');
 if(fs.existsSync(out)){if(!fs.existsSync(marker)||JSON.parse(fs.readFileSync(marker)).name!=='tomatoclock')throw new Error('输出目录不是本项目生成的应用，拒绝覆盖。');fs.rmSync(out,{recursive:true,force:true});}
 fs.mkdirSync(out,{recursive:true});const meta=require('../package.json');fs.writeFileSync(marker,JSON.stringify({name:meta.name,version:meta.version}));
 const copy=(a,b)=>fs.cpSync(a,b,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
 const runtimeDir=path.dirname(require('electron'));for(const item of fs.readdirSync(runtimeDir))copy(path.join(runtimeDir,item),path.join(out,item));
 fs.renameSync(path.join(out,'electron'),path.join(out,'TomatoClock'));fs.rmSync(path.join(out,'resources/default_app.asar'),{force:true});
 const appRoot=path.join(out,'resources/app');fs.mkdirSync(appRoot,{recursive:true});
 for(const item of ['index.html','style.css','custom.css','package.json','js','desktop','assets'])copy(path.join(root,item),path.join(appRoot,item));
 const copied=new Set();
 function dependency(name,from){
  const manifest=require.resolve(`${name}/package.json`,{paths:[from]});const source=path.dirname(manifest),pkg=JSON.parse(fs.readFileSync(manifest));
  if(copied.has(name))return;copied.add(name);copy(source,path.join(appRoot,'node_modules',name));
  for(const child of Object.keys(pkg.dependencies??{}))dependency(child,source);
 }
 for(const name of Object.keys(meta.dependencies))dependency(name,root);
 fs.writeFileSync(path.join(out,'start-tomatoclock'),'#!/bin/sh\nTOMATOCLOCK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$TOMATOCLOCK_DIR/TomatoClock" --ozone-platform=x11 "$@"\n',{mode:0o755});
 fs.writeFileSync(path.join(out,'README.txt'),'TomatoClock 本地番茄钟\n双击 start-tomatoclock 启动。\n学习记录位于用户 XDG 数据目录的 tomatoclock/learning.sqlite；关闭应用后可复制该文件备份。\n关闭窗口即退出，未完成的番茄不入账。更新前先关闭应用，替换程序即可，数据目录保持不变。\n');
 console.log(out);return out;
}
if(require.main===module)buildPackage();module.exports={buildPackage};
