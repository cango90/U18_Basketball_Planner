#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'private', 'zugangsdaten.json');
const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const apiKey = index.match(/apiKey:'([^']+)'/)?.[1];
const [command, id, nextCode] = process.argv.slice(2);
const database = JSON.parse(await fs.readFile(file, 'utf8'));
const find = () => database.zugange.find(entry => entry.id === String(id || '').toLowerCase());

function help() {
  console.log('Verwendung:');
  console.log('  node scripts/manage-access.mjs list');
  console.log('  node scripts/manage-access.mjs show <zugang-id>');
  console.log('  node scripts/manage-access.mjs set <zugang-id> <neuer-code>');
}
async function firebase(pathname, body) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${pathname}?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Firebase-Anfrage fehlgeschlagen');
  return data;
}

if (command === 'list') {
  database.zugange.forEach(entry => console.log(`${entry.id.padEnd(10)} ${entry.name} · ${entry.rolle}`));
} else if (command === 'show') {
  const entry = find();
  if (!entry) throw new Error('Zugang-ID nicht gefunden.');
  console.log(`${entry.name}\nID: ${entry.id}\nCode: ${entry.code}`);
} else if (command === 'set') {
  const entry = find();
  if (!entry || !nextCode || nextCode.length < 8) throw new Error('Bitte ID und einen neuen Code mit mindestens 8 Zeichen angeben.');
  const login = await firebase('accounts:signInWithPassword', { email: `${entry.id}@teamplaner.invalid`, password: entry.code, returnSecureToken: true });
  await firebase('accounts:update', { idToken: login.idToken, password: nextCode, returnSecureToken: true });
  entry.code = nextCode;
  await fs.writeFile(file, `${JSON.stringify(database, null, 2)}\n`, { mode: 0o600 });
  console.log(`Code für ${entry.name} wurde in Firebase und lokal geändert.`);
} else {
  help();
}
