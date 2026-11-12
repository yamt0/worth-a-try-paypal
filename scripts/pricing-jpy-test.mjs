import assert from 'node:assert/strict';
import {calculateJpyPrice} from '../worker/pricing-jpy.mjs';
assert.deepEqual(calculateJpyPrice(1000,100),{adBudgetYen:1000,feeYen:300,adjustmentYen:0,totalYen:1300,currency:'jpy'});
assert.equal(calculateJpyPrice(101,100).feeYen,30);
assert.equal(calculateJpyPrice(105,100).feeYen,32);
assert.throws(()=>calculateJpyPrice(1001,1));
assert.throws(()=>calculateJpyPrice(99,100));assert.throws(()=>calculateJpyPrice(100.1,100));assert.deepEqual(calculateJpyPrice(1,1),{adBudgetYen:1,feeYen:0,adjustmentYen:199,totalYen:200,currency:'jpy'});assert.throws(()=>calculateJpyPrice(100,0));
console.log('JPY amount, 30% rounding, and checkout bounds passed.');
