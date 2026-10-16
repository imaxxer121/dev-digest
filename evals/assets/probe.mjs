// Fixed no-model probe: a host listener is alive, so refusal proves more than "no server".
import { writeFile, readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
const [writePath, outsidePath, port] = process.argv.slice(2);
const denied = error => ['EACCES', 'EPERM'].includes(error?.code);
let writeDenied = false, readDenied = false;
try { await writeFile(writePath, 'sandbox must deny this'); } catch (error) { writeDenied = denied(error); }
try { await readFile(outsidePath); } catch (error) { readDenied = denied(error); }
const networkDenied = await new Promise(resolve => {
  const socket = createConnection({ host: '127.0.0.1', port: Number(port) });
  socket.setTimeout(1500, () => { socket.destroy(); resolve(false); });
  socket.on('connect', () => { socket.destroy(); resolve(false); });
  socket.on('error', error => resolve(denied(error)));
});
console.log(JSON.stringify({ writeDenied, readDenied, networkDenied }));
if (!writeDenied || !networkDenied) process.exitCode = 1;
