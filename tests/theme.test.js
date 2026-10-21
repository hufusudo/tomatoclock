import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTheme,applyTheme,THEME_VARIABLES} from '../js/theme.js';
import * as themes from '../js/theme.js';

test('built-in themes replace custom values and restore the unmodified default',()=>{
 const props=new Map([['--nav-index','2']]),root={dataset:{},style:{setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)}};
 applyTheme(root,{'--theme-font':'serif','--theme-background':'#123456','--theme-ring-work':'#fff'});
 themes.applyBuiltInTheme(root,'terminal');
 assert.equal(root.dataset.theme,'terminal');assert.equal(props.get('--nav-index'),'2');assert.notEqual(props.get('--theme-background'),'#123456');assert.match(props.get('--theme-timer-font'),/mono/i);
 themes.applyBuiltInTheme(root,'default');assert.equal(root.dataset.theme,undefined);assert.deepEqual([...props],[['--nav-index','2']]);
});
test('unknown built-in identifiers cannot change the current appearance',()=>{
 const props=new Map(),root={dataset:{},style:{setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)}};
 themes.applyBuiltInTheme(root,'paper');const before=[...props];
 assert.throws(()=>themes.applyBuiltInTheme(root,'../../custom.css'));assert.deepEqual([...props],before);assert.equal(root.dataset.theme,'paper');
});
test('every shipped built-in can apply through the public variable validator',()=>{
 for(const preset of themes.BUILT_IN_THEMES){const props=new Map(),root={dataset:{},style:{setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)}};themes.applyBuiltInTheme(root,preset.id);assert.ok([...props.keys()].every(key=>Object.hasOwn(THEME_VARIABLES,key)));}
});
test('built-in body text and secondary labels remain readable on their background',()=>{
 const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 for(const preset of themes.BUILT_IN_THEMES.filter(theme=>theme.id!=='default'))for(const name of ['text','muted']){
  const a=luminance(preset.values['--theme-background']),b=luminance(preset.values[`--theme-${name}`]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.ok(ratio>=4.5,`${preset.id} ${name} contrast ${ratio.toFixed(2)} must reach 4.5:1`);
 }
});

test('theme reads only declared colour and font variables, keeping internal control variables closed',()=>{
 const result=parseTheme('/* theme */ :root { --theme-background:#123456; --theme-font:"思源黑体", sans-serif; --theme-ring-break:#abc; --nav-index:2; --fg:red; }');
 assert.deepEqual({...result.values},{'--theme-background':'#123456','--theme-font':'"思源黑体", sans-serif','--theme-ring-break':'#abc'});
 assert.deepEqual(result.warnings,['--nav-index','--fg']);
});
test('rules, imports, animations and ordinary declarations are never accepted as a stylesheet',()=>{
 for(const css of ['.nav-tab { color:red; }',':root { --theme-text:#fff; } .press-button { transform:none; }','@import "https://example.invalid/theme.css";', '@keyframes x { to { opacity:0; } }', ':root { font-family:serif; }', ':root,button { --theme-text:#fff; }',':root { --theme-text:#fff; /* unfinished']){
  assert.throws(()=>parseTheme(css),/主题|变量|格式|注释/);
 }
});
test('values cannot inject declarations, external resources, functions or layout into permitted variables',()=>{
 for(const declaration of ['--theme-background:url(https://example.invalid/a)','--theme-background:var(--nav-index)','--theme-text:inherit','--theme-font:serif !important','--theme-font:url(test.woff)','--theme-font:"broken','--theme-ring-work:rgb(1,2,3)','--theme-text:#12'])assert.throws(()=>parseTheme(`:root { ${declaration}; }`),/值|颜色|字体/);
 assert.equal(parseTheme(':root { --theme-records-background:transparent; --theme-text:#1234; }').values['--theme-text'],'#1234');
 assert.throws(()=>parseTheme(' '.repeat(32769)),/过大/);
});
test('theme replacement removes only old public theme values and cannot touch navigation position',()=>{
 const props=new Map([['--nav-index','2']]),style={setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)};
 applyTheme({style},parseTheme(':root { --theme-text:#123456; --theme-ring-work:#abc; }').values);
 applyTheme({style},parseTheme(':root { --theme-background:#fff; }').values);
 assert.deepEqual([...props],[['--nav-index','2'],['--theme-background','#fff']]);
 assert.throws(()=>applyTheme({style},{'--nav-index':'0'}));assert.equal(props.get('--nav-index'),'2');
});
test('the shipped custom.css template documents exactly the public variables and leaves defaults untouched',()=>{
 const template=readFileSync(new URL('../custom.css',import.meta.url),'utf8');assert.deepEqual(Object.keys(parseTheme(template).values),[]);
 const documented=[...template.matchAll(/(--theme-[a-z-]+)\s*:/g)].map(match=>match[1]);
 assert.deepEqual(documented.sort(),Object.keys(THEME_VARIABLES).sort());
});
test('ring widths are bounded numbers, never arbitrary CSS lengths or expressions',()=>{
 assert.equal(parseTheme(':root { --theme-ring-track-width:4; --theme-ring-progress-width:0.5; }').values['--theme-ring-track-width'],'4');
 for(const value of ['0','13','4px','calc(2 + 2)','NaN'])assert.throws(()=>parseTheme(`:root { --theme-ring-track-width:${value}; }`));
});
