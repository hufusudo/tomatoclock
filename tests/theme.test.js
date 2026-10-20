import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTheme,applyTheme,THEME_VARIABLES} from '../js/theme.js';

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
