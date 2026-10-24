import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source = await readFile(new URL('../game/client/recovery.js', import.meta.url),'utf8');
const context = {module:{exports:{}}};
runInNewContext(source,context);
const Recovery = context.module.exports;

test('server clock heartbeats keep the same render key, while real presence or room changes invalidate it', () => {
  const view = {serverNow:1000,revision:2,presenceRevision:1,players:[{id:'guest',connected:false,offlineSince:500}],self:{cash:1000}};
  assert.equal(Recovery.stableSignature(view),Recovery.stableSignature({...view,serverNow:2000}));
  assert.notEqual(Recovery.stableSignature(view),Recovery.stableSignature({...view,presenceRevision:2,players:[{id:'guest',connected:true,offlineSince:null}]}));
  assert.notEqual(Recovery.stableSignature(view),Recovery.stableSignature({...view,revision:3,self:{cash:750}}));
  assert.notEqual(Recovery.stableSignature(null),Recovery.stableSignature(view));
  assert.equal(view.serverNow,1000,'Computing a key cannot modify the accepted projection.');
});

test('elapsed clocks use only supplied server or monotonic anchors and handle missing legacy metadata', () => {
  assert.equal(Recovery.elapsed(15000,25001),10);
  assert.equal(Recovery.elapsed(25001,15000),0);
  assert.equal(Recovery.elapsed(null,25001),null);
  assert.equal(Recovery.elapsed(undefined,25001),null);
  assert.equal(Recovery.clock(0),'0:00');
  assert.equal(Recovery.clock(65),'1:05');
  assert.equal(Recovery.clock(3661),'1:01:01');
  assert.equal(Recovery.clock(null),'—');
});

test('recovery reasons distinguish a stage blocker from an offline player whose required choice is already sealed', () => {
  const host = {id:'host',active:true,ready:true,submitted:false};
  const guest = {id:'guest',active:true,ready:false,submitted:false};
  const view = {phase:'auction',hostId:host.id,winnerId:guest.id,players:[host,guest]};
  const before = JSON.stringify(view);
  assert.equal(Recovery.reason(view,guest),'This player still needs to submit a bid or pass.');
  assert.equal(Recovery.reason(view,{...guest,submitted:true}),'Their sealed choice is already submitted.');
  assert.equal(Recovery.reason({...view,phase:'round-summary'},host),'The host needs to open the next round.');
  assert.equal(Recovery.reason({...view,phase:'round-summary'},guest),'This player has no pending action in this stage.');
  assert.equal(Recovery.reason({...view,phase:'dispose'},guest),'The winner needs to settle this crate.');
  assert.equal(Recovery.reason({...view,phase:'dispose'},host),'This player has no pending action in this stage.');
  assert.equal(Recovery.reason({...view,phase:'lobby'},guest),'This player still needs to get ready.');
  assert.equal(Recovery.reason({...view,phase:'lobby'},host),'This player is already ready.');
  const allReady = {...view,players:[host,{...guest,ready:true}]};
  assert.equal(Recovery.reason({...allReady,phase:'lobby'},host),'The host needs to start the auction.');
  assert.equal(Recovery.reason({...allReady,phase:'result'},host),'The host needs to open the next crate or finish the session.');
  assert.equal(Recovery.reason({...view,phase:'ended'},guest),'This player has no pending action in this stage.');
  assert.equal(JSON.stringify(view),before,'Advice must not mutate readiness, bids, cash, or the phase.');
});
