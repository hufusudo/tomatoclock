import {test} from 'node:test';import assert from 'node:assert/strict';
import {accordionShape} from '../js/rest-view.js';
test('accordion expands from a concave folded ribbon into a full flat page',()=>{
 const folded=accordionShape(0,1000,600),half=accordionShape(.5,1000,600),open=accordionShape(1,1000,600);
 assert.ok(folded.height<half.height&&half.height<open.height);assert.ok(folded.centerWidth<half.centerWidth&&half.centerWidth<open.centerWidth);assert.ok(folded.dent>0);assert.equal(open.dent,0);assert.equal(open.width,1000);assert.equal(open.height,600);assert.equal(open.centerWidth,1000);
});
test('resized or clamped animation frames keep finite geometry within the viewport',()=>{
 for(const p of [-1,0,.2,.8,1,2]){const s=accordionShape(p,680,560);for(const value of Object.values(s))assert.ok(Number.isFinite(value));assert.ok(s.left>=0&&s.left+s.width<=680);assert.ok(s.height>0&&s.height<=560);}
});
