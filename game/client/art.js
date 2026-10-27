(function (root, factory) {
  const art = factory();
  if (typeof module === 'object' && module.exports) module.exports = art;
  else root.SecondValueArt = art;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const shapes = ['clock', 'cup', 'badge', 'camera', 'radio', 'map'];
  const catalogColumns = [
    ['harbor-clock', 'station-clock', 'prop-clock'],
    ['replica-cup', 'tea-cup', 'sailor-cup'],
    ['crew-badge', 'replica-badge', 'expo-badge'],
    ['dock-camera', 'toy-camera', 'studio-camera'],
    ['harbor-radio', 'travel-radio', 'prop-radio'],
    ['harbor-map', 'map-print', 'star-chart']
  ];

  function cell(sheet, columns, rows, column, row) {
    return Object.freeze({sheet, columns, rows, column, row});
  }

  const covered = Object.fromEntries(shapes.map((shape, index) => [
    shape,
    cell('assets/covered-lots-v1.png', 3, 2, index % 3, Math.floor(index / 3))
  ]));
  const catalog = Object.create(null);
  catalogColumns.forEach((identities, column) => identities.forEach((identity, row) => {
    catalog[identity] = {
      shape: shapes[column],
      visual: cell(`assets/catalog-original-v2/${identity}.webp`, 1, 1, 0, 0)
    };
  }));
  const expansionImages = ['railway-cabinet-clock-v2.webp','cracked-porcelain-cup-v2.webp','naval-service-badge-v2.webp','replica-folding-camera-v2.webp','console-receiver-v2.webp','original-railway-map-v2.webp'];
  ['cabinet-clock','cracked-cup','navy-badge','replica-camera','console-radio','railway-map'].forEach((identity,column) => {
    catalog[identity] = {shape:shapes[column],visual:cell(`assets/catalog-expansion-v2/${expansionImages[column]}`,1,1,0,0)};
  });

  ['midnight-regulator','tide-wireless','blue-line-cup','canceled-voyage-medal','last-service-camera','night-pilot-chart','gilded-prop-clock','silver-stage-chart'].forEach((identity,index) => {
    const shape=['clock','radio','cup','badge','camera','map','clock','map'][index];
    catalog[identity]={shape,visual:cell('assets/rare-lots-v1.png',4,2,index%4,Math.floor(index/4))};
  });

  // Covered artwork must depend only on the public outline, including before
  // authentication. Do not use an identity to select a covered variant.
  function visualFor(item, known) {
    if (!item || typeof item !== 'object') return null;
    const shape = item.shape;
    if (typeof shape !== 'string' || !Object.hasOwn(covered, shape)) return null;
    const fallback = covered[shape];
    if (known !== true) return fallback;
    const identity = item.catalogId;
    const entry = typeof identity === 'string' ? catalog[identity] : null;
    return entry && entry.shape === shape ? entry.visual : fallback;
  }

  const portraits = Object.fromEntries([
    'restorer', 'appraiser', 'collector', 'salvager', 'curator', 'broker'
  ].map(role => [role, cell(`assets/portrait-${role}-v2.png`, 1, 1, 0, 0)]));
  const fallbackPortrait = cell('assets/bidder-portraits-v1.png', 2, 2, 1, 1);

  function portraitFor(role) {
    // The chosen role is the character, including for the local player's seat.
    // Unknown roles from older data retain the original neutral fallback.
    return typeof role === 'string' && Object.hasOwn(portraits, role)
      ? portraits[role]
      : fallbackPortrait;
  }

  return Object.freeze({visualFor, portraitFor});
});
