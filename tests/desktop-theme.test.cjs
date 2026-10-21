const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createThemeService,themeConfigDir}=require('../desktop/theme.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-theme-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const templatePath=path.join(dir,'template.css'),configDir=path.join(dir,'config');fs.writeFileSync(templatePath,':root { /* customise here */ }');const opened=[];return {dir,configDir,templatePath,opened,service:createThemeService({configDir,templatePath,openFile:async file=>{opened.push(file);return '';}})};}
test('missing theme uses template without creating files; explicit open creates once and preserves user edits',async t=>{
 const s=fixture(t);assert.equal((await s.service.read()).exists,false);assert.equal(fs.existsSync(s.configDir),false);
 const first=await s.service.open();assert.equal(first.filePath,path.join(s.configDir,'custom.css'));assert.equal(fs.readFileSync(first.filePath,'utf8'),':root { /* customise here */ }');
 fs.writeFileSync(first.filePath,':root { --theme-background:#123456; }');await s.service.open();assert.equal((await s.service.read()).css,':root { --theme-background:#123456; }');assert.equal(s.opened.length,2);
});
test('theme reads are bounded and reject links, directories and oversized user files without modifying them',async t=>{
 const s=fixture(t);fs.mkdirSync(s.configDir);const file=path.join(s.configDir,'custom.css'),outside=path.join(s.dir,'personal.css');fs.writeFileSync(outside,'keep');fs.symlinkSync(outside,file);await assert.rejects(s.service.read());await assert.rejects(s.service.open());assert.equal(fs.readFileSync(outside,'utf8'),'keep');fs.unlinkSync(file);
 fs.mkdirSync(file);await assert.rejects(s.service.read());fs.rmdirSync(file);fs.writeFileSync(file,'x'.repeat(32769));await assert.rejects(s.service.read(),/过大/);assert.equal(fs.statSync(file).size,32769);
});
test('theme configuration uses an absolute XDG config home or the user configuration default',()=>{
 assert.equal(themeConfigDir({XDG_CONFIG_HOME:'/tmp/config'},'/tmp/home'),'/tmp/config/tomatoclock');assert.equal(themeConfigDir({XDG_CONFIG_HOME:'relative'},'/tmp/home'),'/tmp/home/.config/tomatoclock');
});
test('a missing template never leaves a misleading empty user theme',async t=>{
 const s=fixture(t);fs.unlinkSync(s.templatePath);await assert.rejects(s.service.open());assert.equal(fs.existsSync(path.join(s.configDir,'custom.css')),false);
});
test('built-in theme selection is absent without creating config files and survives service restart',async t=>{
 const s=fixture(t),selectionPath=path.join(s.configDir,'theme-selection.json');
 assert.deepEqual(await s.service.getSelection(),{id:null});assert.equal(fs.existsSync(s.configDir),false);
 for(const id of ['default','paper','instrument','terminal','custom']){
  assert.deepEqual(await s.service.select(id),{id});
  const restarted=createThemeService({configDir:s.configDir,templatePath:s.templatePath,openFile:async()=>''});
  assert.deepEqual(await restarted.getSelection(),{id});
 }
 assert.deepEqual(JSON.parse(fs.readFileSync(selectionPath,'utf8')),{format:'tomatoclock-theme-selection-v1',id:'custom'});
});
test('invalid selection files and ids are preserved and never replaced',async t=>{
 const s=fixture(t),file=path.join(s.configDir,'theme-selection.json');fs.mkdirSync(s.configDir);
 for(const id of ['',null,{},'CUSTOM','arbitrary'])await assert.rejects(s.service.select(id));
 for(const contents of ['{broken','{}',JSON.stringify({format:'wrong',id:'paper'})]){
  fs.writeFileSync(file,contents);await assert.rejects(s.service.getSelection());await assert.rejects(s.service.select('paper'));
  assert.equal(fs.readFileSync(file,'utf8'),contents);
 }
 fs.unlinkSync(file);const outside=path.join(s.dir,'outside.json');fs.writeFileSync(outside,'keep');fs.symlinkSync(outside,file);
 await assert.rejects(s.service.getSelection());await assert.rejects(s.service.select('paper'));assert.equal(fs.readFileSync(outside,'utf8'),'keep');
});
test('selection reads reject directories and oversized files without changing custom.css',async t=>{
 const s=fixture(t),file=path.join(s.configDir,'theme-selection.json'),custom=path.join(s.configDir,'custom.css');fs.mkdirSync(s.configDir);fs.writeFileSync(custom,'user css bytes');
 fs.mkdirSync(file);await assert.rejects(s.service.getSelection());await assert.rejects(s.service.select('paper'));fs.rmdirSync(file);
 fs.writeFileSync(file,'x'.repeat(32769));await assert.rejects(s.service.getSelection(),/过大/);await assert.rejects(s.service.select('paper'));
 assert.equal(fs.readFileSync(file,'utf8').length,32769);assert.equal(fs.readFileSync(custom,'utf8'),'user css bytes');
});
test('failed selection replacement leaves the last saved id and custom CSS intact',async t=>{
 const s=fixture(t),file=path.join(s.configDir,'theme-selection.json'),custom=path.join(s.configDir,'custom.css');await s.service.select('paper');fs.writeFileSync(custom,'custom css');
 const original=fs.promises.rename;fs.promises.rename=async()=>{throw Object.assign(new Error('disk full'),{code:'ENOSPC'});};
 try{await assert.rejects(s.service.select('terminal'),/disk full/);}finally{fs.promises.rename=original;}
 assert.deepEqual(await s.service.getSelection(),{id:'paper'});assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify({format:'tomatoclock-theme-selection-v1',id:'paper'}));assert.equal(fs.readFileSync(custom,'utf8'),'custom css');
});
test('concurrent first creation and a changed existing file are preserved',async t=>{
 const s=fixture(t),file=path.join(s.configDir,'theme-selection.json');const link=fs.promises.link;
 fs.promises.link=async(source,target)=>{fs.writeFileSync(target,'external first writer');return link(source,target);};
 try{await assert.rejects(s.service.select('paper'),/EEXIST/);}finally{fs.promises.link=link;}
 assert.equal(fs.readFileSync(file,'utf8'),'external first writer');fs.writeFileSync(file,JSON.stringify({format:'tomatoclock-theme-selection-v1',id:'paper'}));
 const open=fs.promises.open;
 fs.promises.open=async(filename,...args)=>{if(String(filename).endsWith('.tmp'))fs.writeFileSync(file,'external changed file');return open(filename,...args);};
 try{await assert.rejects(s.service.select('terminal'),/发生变化/);}finally{fs.promises.open=open;}
 assert.equal(fs.readFileSync(file,'utf8'),'external changed file');
});
