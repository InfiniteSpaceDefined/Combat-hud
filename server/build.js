// Builds template.yaml by inlining handler.js and killswitch.js into template.src.yaml.
const fs = require('fs'), path = require('path');
const dir = __dirname;
const inline = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s+$/, '').split('\n').map(l => (l ? '          ' + l : '')).join('\n');
let out = fs.readFileSync(path.join(dir, 'template.src.yaml'), 'utf8');
for (const [ph, f] of [['__HANDLER__', 'handler.js'], ['__KILLSWITCH__', 'killswitch.js']]) {
  if (!out.includes(ph + '\n')) throw new Error(ph + ' placeholder missing');
  out = out.replace(ph, () => inline(f));
}
fs.writeFileSync(path.join(dir, 'template.yaml'), out);
console.log('template.yaml', Buffer.byteLength(out), 'bytes (direct-upload limit 51200)');
