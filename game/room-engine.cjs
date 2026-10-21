'use strict';

// This module owns multiplayer truth. Only viewFor() may cross the HTTP boundary.
const E = require('./engine.cjs');
const clone = value => structuredClone(value);
const activePlayers = room => room.players.filter(player => player.active);
const fail = message => { throw new Error(message); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function validateRoom(room) {
  if (!room || room.version !== 1 || !Array.isArray(room.players)) fail('Choose a valid room.');
}
function profile(input) {
  if (!plain(input) || typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.id)) fail('Choose a valid player.');
  if (typeof input.name !== 'string' || [...input.name.trim()].length < 1 || [...input.name.trim()].length > 20 || /[\u0000-\u001f\u007f]/.test(input.name)) fail('Enter a name from 1 to 20 characters.');
  if (!own(E.ROLES, input.role)) fail('Choose a valid role.');
  if (input.role === 'collector' && !own(E.THEMES, input.theme)) fail('Choose a valid collection theme.');
  return {id: input.id, name: input.name.trim(), role: input.role, theme: input.role === 'collector' ? input.theme : null, cash: E.STARTING_CASH, profit: 0, ready: false, active: true, bid: null, inspected: []};
}
function phase(room, next) {
  room.phase = next;
  room.turnSequence++;
  room.turnId = `${room.code}:${room.turnSequence}`;
}
function playerFor(room, id, requireActive = true) {
  const player = room.players.find(candidate => candidate.id === id);
  if (!player || (requireActive && !player.active)) fail('This player is not in the room.');
  return player;
}
function requireHost(room, player) {
  if (player.id !== room.hostId) fail('Only the host can do that.');
}
function requirePhase(room, expected) {
  if (!expected.includes(room.phase)) fail('That action is not available in this phase.');
}
function commit(room, draft) {
  draft.revision = room.revision + 1;
  Object.assign(room, draft);
  return room;
}
function crateSeed(seed, ordinal) {
  let value = (seed + Math.imul(ordinal - 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}
function drawCrate(room) {
  const seed = crateSeed(room.seed, room.auctionNumber);
  // A room keeps its catalog across deployments and consecutive crates.
  const game = E.newGame('appraiser', seed, 'harbor', {rulesVersion: room.rulesVersion ?? 2, instancePrefix: 'room', noBots: true});
  room.items = game.items.map((item, slot) => ({...item, id: `lot-${slot}`}));
  room.publicIndex = game.publicIndex;
  room.reservePrice = game.reservePrice;
  room.round = 1;
  room.history = [];
  room.winnerId = null;
  room.winningBid = null;
  room.receipt = null;
  room.priority = activePlayers(room).map(player => player.id);
  const random = E.rng(seed ^ 0x72a6d129);
  for (let index = room.priority.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [room.priority[index], room.priority[target]] = [room.priority[target], room.priority[index]];
  }
  for (const player of room.players) {
    player.bid = null;
    player.inspected = [];
    player.ready = false;
  }
  phase(room, 'auction');
}
function createRoom({code, seed, host} = {}) {
  if (typeof code !== 'string' || !/^[A-Z0-9]{4,12}$/.test(code)) fail('Choose a valid room code.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) fail('Choose a valid game seed.');
  const player = profile(host);
  return {version: 1, rulesVersion: E.RULES_VERSION, code, seed, revision: 1, turnSequence: 0, turnId: `${code}:0`, phase: 'lobby', hostId: player.id, players: [player], auctionNumber: 0, round: 0, items: [], publicIndex: null, reservePrice: 0, history: [], priority: [], winnerId: null, winningBid: null, receipt: null, ledger: [], endedReason: null};
}
function joinRoom(room, input) {
  validateRoom(room);
  requirePhase(room, ['lobby']);
  const player = profile(input);
  if ((room.rulesVersion ?? 2) < 3 && ['salvager', 'curator', 'broker'].includes(player.role)) fail('Start a new room to use the expanded roles.');
  if (room.players.some(candidate => candidate.id === player.id)) fail('This player has already joined.');
  if (activePlayers(room).length >= 4) fail('The room already has four players.');
  const draft = clone(room);
  draft.players.push(player);
  return commit(room, draft);
}
function validateCommand(command) {
  if (!plain(command) || typeof command.type !== 'string' || typeof command.turnId !== 'string') fail('Choose a valid room action.');
  const fields = {
    configure: ['role', 'theme'], ready: ['ready'], start: [], inspect: ['slot'],
    bid: ['amount', 'pass'], withdraw: [], next: [], sell: ['mode', 'repairSlots', 'pairSlots'],
    continue: [], finish: [], leave: []
  };
  if (!own(fields, command.type)) fail('Choose a valid room action.');
  // Existing clients may omit abilitySlots. An omitted selection never activates
  // a new role ability automatically on behalf of a player.
  const allowed = ['type', 'turnId', ...fields[command.type], ...(command.type === 'sell' ? ['abilitySlots'] : [])];
  if (Object.keys(command).some(key => !allowed.includes(key))) fail('Choose a valid room action.');
  if (fields[command.type].some(key => !own(command, key))) fail('Choose a valid room action.');
}
function ledgerEntry(room) {
  if (room.ledger.some(entry => entry.auctionNumber === room.auctionNumber)) fail('This crate has already been settled.');
  room.ledger.push({auctionNumber: room.auctionNumber, winnerId: room.winnerId, paid: room.winningBid || 0, players: room.players.map(player => ({id: player.id, name: player.name, cash: player.cash, profit: player.profit})), ...(room.reservePrice > 0 ? {reservePrice: room.reservePrice} : {})});
  for (const player of room.players) player.ready = false;
  phase(room, 'result');
}
function reveal(room) {
  const bids = activePlayers(room).map(player => ({id: player.id, name: player.name, role: player.role, theme: player.theme, bid: player.bid.pass ? 0 : player.bid.amount}));
  const resolved = E.resolveRound(bids, room.priority, room.round, room.reservePrice ?? 0);
  room.history.push(resolved);
  room.winnerId = resolved.winner;
  room.winningBid = resolved.hammered ? resolved.highest : null;
  if (!resolved.hammered && room.round < 3) {
    phase(room, 'round-summary');
    return;
  }
  if (!resolved.winner) {
    ledgerEntry(room);
    return;
  }
  const winner = playerFor(room, resolved.winner);
  winner.cash -= resolved.highest;
  winner.profit = winner.cash - E.STARTING_CASH;
  phase(room, 'dispose');
}
function slotsToIds(room, slots, limit = 2) {
  if (!Array.isArray(slots) || slots.length > limit || slots.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= room.items.length) || new Set(slots).size !== slots.length) fail('Choose valid processing objects.');
  return slots.map(slot => room.items[slot].id);
}
function applyAction(room, actorId, command) {
  validateRoom(room);
  validateCommand(command);
  if (command.turnId !== room.turnId) fail('The room has moved on. Refresh before trying again.');
  const current = playerFor(room, actorId);
  if (room.phase === 'ended') fail('This room has ended.');
  const draft = clone(room), player = playerFor(draft, current.id);
  if (command.type === 'configure') {
    requirePhase(draft, ['lobby']);
    const next = profile({...player, role: command.role, theme: command.theme});
    if ((draft.rulesVersion ?? 2) < 3 && ['salvager', 'curator', 'broker'].includes(next.role)) fail('Start a new room to use the expanded roles.');
    if (player.role === next.role && player.theme === next.theme && !player.ready) return room;
    player.role = next.role; player.theme = next.theme; player.ready = false;
  } else if (command.type === 'ready') {
    requirePhase(draft, ['lobby', 'result']);
    if (typeof command.ready !== 'boolean') fail('Choose a valid ready status.');
    if (player.ready === command.ready) return room;
    player.ready = command.ready;
  } else if (command.type === 'start') {
    requirePhase(draft, ['lobby']); requireHost(draft, player);
    const players = activePlayers(draft);
    if (players.length < 2 || players.some(candidate => !candidate.ready)) fail('At least two players must all be ready.');
    draft.auctionNumber = 1;
    drawCrate(draft);
  } else if (command.type === 'inspect') {
    requirePhase(draft, ['auction']);
    if (player.role !== 'appraiser') fail('Only the appraiser can inspect privately.');
    if (player.bid) fail('Withdraw your bid before inspecting.');
    if (!Number.isInteger(command.slot) || command.slot < 0 || command.slot >= draft.items.length) fail('Choose a valid object.');
    if (player.inspected.includes(command.slot) || (draft.round === 3 && command.slot === draft.publicIndex)) return room;
    if (player.inspected.length >= 2) fail('Both inspections have been used.');
    player.inspected.push(command.slot);
  } else if (command.type === 'bid') {
    requirePhase(draft, ['auction']);
    if (player.bid) fail('Withdraw your existing bid before changing it.');
    const minimum = Math.max(1, draft.reservePrice ?? 0);
    if (command.pass === false && player.cash < minimum && draft.reservePrice > 0) fail(`You need at least ${minimum} to bid on this crate. Pass this round.`);
    if (typeof command.pass !== 'boolean' || (command.pass ? command.amount !== null : !Number.isSafeInteger(command.amount) || command.amount < minimum || command.amount > player.cash)) fail(`Enter a whole-number bid from ${minimum} to ${player.cash}, or pass.`);
    player.bid = {amount: command.amount, pass: command.pass};
    if (activePlayers(draft).every(candidate => candidate.bid)) reveal(draft);
  } else if (command.type === 'withdraw') {
    requirePhase(draft, ['auction']);
    if (!player.bid) fail('There is no submitted bid to withdraw.');
    player.bid = null;
  } else if (command.type === 'next') {
    requirePhase(draft, ['round-summary']); requireHost(draft, player);
    if (draft.round >= 3) fail('The last auction round is already complete.');
    draft.round++;
    for (const candidate of draft.players) candidate.bid = null;
    phase(draft, 'auction');
  } else if (command.type === 'sell') {
    requirePhase(draft, ['dispose']);
    if (draft.winnerId !== player.id) fail('Only the winner can sell this crate.');
    const repairIds = slotsToIds(draft, command.repairSlots), pairIds = slotsToIds(draft, command.pairSlots);
    const abilityIds = slotsToIds(draft, own(command, 'abilitySlots') ? command.abilitySlots : [], 3);
    const expandedRole = ['salvager', 'curator', 'broker'].includes(player.role);
    if ((player.role !== 'restorer' && repairIds.length) || (player.role !== 'collector' && pairIds.length) || (!expandedRole && abilityIds.length)) fail('Those processing objects do not match your role.');
    const options = {theme: player.theme};
    if (player.role === 'restorer') options.repairIds = repairIds;
    if (player.role === 'collector') options.pairIds = pairIds;
    if (expandedRole) options.abilityIds = abilityIds;
    const plan = E.salePlan(player.role, draft.items, command.mode, player.cash, options);
    player.cash += plan.recovery;
    player.profit = player.cash - E.STARTING_CASH;
    draft.receipt = {paid: draft.winningBid, sale: plan.sale, cost: plan.cost, bonus: plan.bonus, recovery: plan.recovery, profit: plan.recovery - draft.winningBid, cash: player.cash, repairs: plan.repairs.map(id => draft.items.findIndex(item => item.id === id)), pair: plan.pair.map(id => draft.items.findIndex(item => item.id === id)), ability: (plan.ability || []).map(id => draft.items.findIndex(item => item.id === id)), ...(draft.reservePrice > 0 ? {reservePrice: draft.reservePrice} : {})};
    ledgerEntry(draft);
  } else if (command.type === 'continue') {
    requirePhase(draft, ['result']); requireHost(draft, player);
    const players = activePlayers(draft);
    if (players.length < 2 || players.some(candidate => !candidate.ready)) fail('At least two players must all be ready.');
    draft.auctionNumber++;
    drawCrate(draft);
  } else if (command.type === 'finish') {
    requirePhase(draft, ['result']); requireHost(draft, player);
    draft.endedReason = 'The host ended the session.';
    phase(draft, 'ended');
  } else if (command.type === 'leave') {
    requirePhase(draft, ['lobby', 'result']);
    if (draft.phase === 'lobby') draft.players = draft.players.filter(candidate => candidate.id !== player.id);
    else player.active = false;
    const players = activePlayers(draft);
    if (draft.hostId === player.id) draft.hostId = players[0]?.id || null;
    if (!players.length || (draft.auctionNumber > 0 && players.length < 2)) {
      draft.endedReason = 'Fewer than two players remain.';
      phase(draft, 'ended');
    }
  }
  return commit(room, draft);
}
function publicItem(room, viewer, item, slot) {
  const crateOpened = room.winnerId !== null || ['result', 'ended'].includes(room.phase) && room.auctionNumber > 0;
  const publicKnown = room.round === 3 && slot === room.publicIndex;
  const privateKnown = viewer.inspected.includes(slot);
  const known = crateOpened || publicKnown || privateKnown;
  const range = E.catalogFor(item.shape, room.rulesVersion ?? 2);
  const result = {slot, shape: item.shape, range: {min: range.min, max: range.max}, known, source: crateOpened ? 'Crate opened' : publicKnown ? 'Public reveal' : privateKnown ? 'Private note' : 'Unconfirmed'};
  if (known) {
    for (const key of ['id', 'catalogId', 'name', 'base', 'genuine', 'condition', 'category', 'theme']) result[key] = item[key];
    if (item.repair) result.repair = clone(item.repair);
  }
  return result;
}
function viewFor(room, viewerId) {
  validateRoom(room);
  const viewer = playerFor(room, viewerId, false), players = activePlayers(room);
  const inAuction = room.phase === 'auction', isHost = room.hostId === viewer.id && viewer.active;
  const allReady = players.length >= 2 && players.every(player => player.ready);
  const opened = room.winnerId !== null || ['result', 'ended'].includes(room.phase) && room.auctionNumber > 0;
  const publicCount = room.round >= 2 || opened;
  const publicRepair = room.round === 3 || opened;
  return {
    code: room.code, revision: room.revision, rulesVersion: room.rulesVersion ?? 2, turnId: room.turnId, phase: room.phase,
    hostId: room.hostId, selfId: viewer.id, auctionNumber: room.auctionNumber, round: room.round, reservePrice: room.reservePrice ?? 0,
    players: room.players.map(player => ({id: player.id, name: player.name, role: player.role, theme: player.theme, cash: player.cash, profit: player.profit, ready: player.ready, submitted: !!player.bid, active: player.active})),
    self: {id: viewer.id, role: viewer.role, theme: viewer.theme, cash: viewer.cash, inspectionsLeft: viewer.role === 'appraiser' ? Math.max(0, 2 - viewer.inspected.length) : 0, inspected: [...viewer.inspected], bid: clone(viewer.bid), submitted: !!viewer.bid},
    lots: room.items.map((item, slot) => publicItem(room, viewer, item, slot)),
    public: {genuineCount: publicCount ? room.items.filter(item => item.genuine).length : null, repairableCount: publicRepair ? room.items.filter(item => item.genuine && item.condition === 'damaged' && item.repair).length : null, publicIndex: room.round === 3 || opened ? room.publicIndex : null},
    history: clone(room.history), priority: [...room.priority], winnerId: room.winnerId, winningBid: room.winningBid,
    receipt: clone(room.receipt), ledger: clone(room.ledger),
    can: {
      start: isHost && room.phase === 'lobby' && allReady,
      inspect: viewer.active && inAuction && viewer.role === 'appraiser' && !viewer.bid && viewer.inspected.length < 2,
      submit: viewer.active && inAuction && !viewer.bid,
      withdraw: viewer.active && inAuction && !!viewer.bid,
      next: isHost && room.phase === 'round-summary',
      sell: viewer.active && room.phase === 'dispose' && room.winnerId === viewer.id,
      ready: viewer.active && ['lobby', 'result'].includes(room.phase),
      continue: isHost && room.phase === 'result' && allReady,
      finish: isHost && room.phase === 'result',
      leave: viewer.active && ['lobby', 'result'].includes(room.phase)
    }, endedReason: room.endedReason
  };
}

module.exports = {createRoom, joinRoom, applyAction, viewFor};
