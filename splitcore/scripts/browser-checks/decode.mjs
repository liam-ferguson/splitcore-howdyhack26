// Needs jsQR outside the project, e.g. npm i --prefix ../../.qr jsqr@1.4.0
const { default: jsQR } = await import(process.env.JSQR ?? '../../.qr/node_modules/jsqr/dist/jsQR.js');
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const f = process.argv[2];
const meta = execFileSync('python', ['-I', '-c', `from PIL import Image\nim=Image.open(r'${f}').convert('RGBA')\nopen(r'${f}.raw','wb').write(im.tobytes())\nprint(im.width, im.height)`]).toString().trim().split(' ').map(Number);
const data = new Uint8ClampedArray(readFileSync(`${f}.raw`));
const r = jsQR(data, meta[0], meta[1]);
console.log(r ? `DECODED: ${r.data}` : 'NO QR FOUND');
