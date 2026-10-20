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
