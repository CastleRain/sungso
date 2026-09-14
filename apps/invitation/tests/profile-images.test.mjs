import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePhoto } from '../js/profile-images.mjs';

test('uploaded photos are decoded, resized and re-encoded before persistence; temporary URLs are released',async()=>{
  let revoked=false,draws=0;
  class ImageStub {naturalWidth=4000;naturalHeight=6000;decode(){return Promise.resolve();}}
  const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){draws++;}}),toDataURL:()=> 'data:image/jpeg;base64,YWJjZA=='};
  const value=await preparePhoto({type:'image/png',size:1000},{document:{createElement:()=>canvas},URL:{createObjectURL:()=> 'blob:qa',revokeObjectURL:()=>{revoked=true;}},Image:ImageStub});
  assert.deepEqual(value,{dataUrl:'data:image/jpeg;base64,YWJjZA==',width:1067,height:1600});assert.equal(draws,1);assert.equal(revoked,true);
});
test('invalid formats and very large source files never reach image decoding',async()=>{
  const environment={document:{},URL:{createObjectURL(){throw new Error('must not decode');}},Image:class{}};
  await assert.rejects(preparePhoto({type:'image/svg+xml',size:10},environment),/JPG/);
  await assert.rejects(preparePhoto({type:'image/jpeg',size:30*1024*1024},environment),/25MB/);
});
test('a failed image decode releases the browser URL',async()=>{
  let revoked=false;class ImageStub{decode(){return Promise.reject(new Error('decode'));}}
  await assert.rejects(preparePhoto({type:'image/jpeg',size:10},{document:{},URL:{createObjectURL:()=> 'blob:qa',revokeObjectURL:()=>{revoked=true;}},Image:ImageStub}),/decode/);assert.equal(revoked,true);
});
