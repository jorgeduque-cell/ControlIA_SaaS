const fs = require('fs');
const content = fs.readFileSync('webapp/app.js', 'utf8');
const lines = content.split('\n');
// Keep only first 1514 lines (0-indexed: 0..1513)
const clean = lines.slice(0, 1514).join('\n') + '\n';
fs.writeFileSync('webapp/app.js', clean, 'utf8');
console.log('Truncated from ' + lines.length + ' to 1514 lines');
