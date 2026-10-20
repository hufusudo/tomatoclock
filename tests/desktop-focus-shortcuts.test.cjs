const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createFocusShortcutsService}=require('../desktop/focus-shortcuts.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tomatoclock-shortcuts-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const configDir=path.join(dir,'config');return {dir,configDir,file:path.join(configDir,'focus-shortcuts.json'),service:createFocusShortcutsService({configDir})};}

test('focus shortcuts default empty, validate values, and persist across service restart',async t=>{
 const f=fixture(t);assert.deepEqual(await f.service.get(),[null,null,null]);
 assert.deepEqual(await f.service.save([25,null,180]),[25,null,180]);
 assert.deepEqual(await createFocusShortcutsService({configDir:f.configDir}).get(),[25,null,180]);
 await assert.rejects(f.service.save([0]));assert.deepEqual(await f.service.get(),[25,null,180]);
});

test('unknown, malformed, oversized, and symlink shortcut files are retained without overwrite',async t=>{
 const f=fixture(t);fs.mkdirSync(f.configDir,{recursive:true});fs.writeFileSync(f.file,'{"format":"someone-elses-file"}');
 await assert.rejects(f.service.get());await assert.rejects(f.service.save([20]));assert.equal(fs.readFileSync(f.file,'utf8'),'{"format":"someone-elses-file"}');
 fs.unlinkSync(f.file);fs.writeFileSync(f.file,'{broken');await assert.rejects(f.service.get());await assert.rejects(f.service.save([20]));assert.equal(fs.readFileSync(f.file,'utf8'),'{broken');
 fs.unlinkSync(f.file);fs.symlinkSync(path.join(f.dir,'outside'),''+f.file);await assert.rejects(f.service.get());await assert.rejects(f.service.save([20]));assert.equal(fs.lstatSync(f.file).isSymbolicLink(),true);
});

test('fixed focus shortcut file is bounded and only created for save',async t=>{
 const f=fixture(t);assert.equal(fs.existsSync(f.configDir),false);await f.service.save([10]);
 assert.equal(fs.existsSync(f.file),true);assert.deepEqual(fs.readdirSync(f.configDir),['focus-shortcuts.json']);
 fs.writeFileSync(f.file,'x'.repeat(5000));await assert.rejects(f.service.get());assert.equal(fs.statSync(f.file).size,5000);
});
