var fs = require('fs');
var data = JSON.parse(fs.readFileSync('./in/sample_copy.json','utf8'));
var orderText = fs.readFileSync('./in/txsortorder.txt','utf8');

// Parse order file
var txOrder = {};
orderText.split(/\r?\n/).forEach(function(raw) {
  raw = raw.trim();
  if (!raw || raw.toLowerCase().indexOf('class') === 0) return;
  var qm = raw.match(/"([^"]*)"/g);
  if (!qm || qm.length < 2) return;
  var cls = qm[0].replace(/"/g,'').trim();
  var vn = qm[1].replace(/"/g,'').trim();
  if (!cls || !vn) return;
  if (!txOrder[cls]) txOrder[cls] = [];
  if (txOrder[cls].indexOf(vn) === -1) txOrder[cls].push(vn);
});

console.log('Parsed order:');
Object.keys(txOrder).forEach(function(k) { console.log('  ' + k + ': ' + txOrder[k].join(' | ')); });

// Clone and sort
var clone = JSON.parse(JSON.stringify(data));
clone.view.classes.forEach(function(cls) {
  var orderList = txOrder[cls.name];
  if (!orderList) return;
  var ordered = [];
  var used = {};
  orderList.forEach(function(tv) {
    for (var i = 0; i < cls.attributes.length; i++) {
      if (used[i]) continue;
      if (String(cls.attributes[i].viewname||'').trim() === tv) { ordered.push(cls.attributes[i]); used[i]=true; break; }
    }
  });
  for (var i = 0; i < cls.attributes.length; i++) { if (!used[i]) ordered.push(cls.attributes[i]); }
  cls.attributes = ordered;
});

// Verify
console.log('\nAfter TX sort:');
clone.view.classes.forEach(function(cls) {
  console.log(cls.name + ': ' + cls.attributes.map(function(a){return a.viewname}).join(' | '));
});

// Check apple: expected DOM CCY, FOR CCY, ABC CCY, BCA CCY
var apple = clone.view.classes[1];
var ok = apple.attributes[0].viewname === 'DOM CCY' && apple.attributes[1].viewname === 'FOR CCY' && apple.attributes[2].viewname === 'ABC CCY' && apple.attributes[3].viewname === 'BCA CCY';
console.log('\nApple order correct: ' + (ok ? 'YES' : 'NO'));

// Check orange: expected MNO CCY, CCY DOM, QRTY CCY, ABC CCY
var orange = clone.view.classes[0];
var ok2 = orange.attributes[0].viewname === 'MNO CCY' && orange.attributes[1].viewname === 'CCY DOM' && orange.attributes[2].viewname === 'QRTY CCY' && orange.attributes[3].viewname === 'ABC CCY';
console.log('Orange order correct: ' + (ok2 ? 'YES' : 'NO'));

// Integrity
var allOk = true;
clone.view.classes.forEach(function(cls,i) {
  if (cls.attributes.length !== data.view.classes[i].attributes.length) { console.log('FAIL: count mismatch ' + cls.name); allOk = false; }
  // Check all attribute names still present
  var preNames = data.view.classes[i].attributes.map(function(a){return a.name}).sort();
  var postNames = cls.attributes.map(function(a){return a.name}).sort();
  if (JSON.stringify(preNames) !== JSON.stringify(postNames)) { console.log('FAIL: names mismatch ' + cls.name); allOk = false; }
});
console.log('Integrity: ' + (allOk ? 'OK' : 'FAILED'));

// Check a specific attribute kept all its properties
var firstOrange = clone.view.classes[0].attributes[0];
console.log('\nFirst orange attr after sort:', JSON.stringify(firstOrange, null, 2));
