const fs = require('fs');
let c = fs.readFileSync('generate-api-docs.js', 'utf8');
c = c.replace(/\\\\n/g, '\\n');
fs.writeFileSync('generate-api-docs.js', c);
console.log('Fixed generate-api-docs.js');
