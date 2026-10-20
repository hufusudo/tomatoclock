import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFocusShortcuts} from '../js/focus-shortcuts.js';

test('normalizes up to three empty or integer shortcut slots',()=>{
 assert.deepEqual(normalizeFocusShortcuts([]),[null,null,null]);
 assert.deepEqual(normalizeFocusShortcuts([1,null,180]),[1,null,180]);
 assert.deepEqual(normalizeFocusShortcuts([30,30]),[30,30,null]);
});

test('rejects shortcut count, type, and minute values outside the contract',()=>{
 for(const value of [[1,2,3,4],null,'30',[0],[181],[1.5],['30'],[false]])assert.throws(()=>normalizeFocusShortcuts(value));
});
