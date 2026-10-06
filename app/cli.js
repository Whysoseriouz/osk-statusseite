'use strict';
// Benutzerverwaltung für den Admin-Bereich.
//   node cli.js user add <name>     Benutzer anlegen / Passwort ändern
//   node cli.js user del <name>     Benutzer löschen
//   node cli.js user list           Benutzer auflisten

const readline = require('readline');
const auth = require('./auth');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(question);
      else if (/[\r\n]/.test(s)) rl.output.write('\n');
    };
    rl.question(question, (a) => {
      rl.close();
      resolve(a);
    });
  });
}

function readStdinLine() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (d) => (buf += d));
    process.stdin.on('end', () => resolve(buf.split(/\r?\n/)[0]));
  });
}

async function main() {
  const [cmd, sub, name] = process.argv.slice(2);
  if (cmd !== 'user' || !['add', 'del', 'list'].includes(sub)) {
    console.log('Verwendung:\n  node cli.js user add <name>\n  node cli.js user del <name>\n  node cli.js user list');
    process.exit(1);
  }
  const users = auth.readUsers();

  if (sub === 'list') {
    const names = Object.keys(users);
    console.log(names.length ? names.join('\n') : '(keine Benutzer angelegt)');
    return;
  }
  if (!name || !/^[a-zA-Z0-9._-]{2,40}$/.test(name)) {
    console.error('Bitte einen gültigen Benutzernamen angeben (2–40 Zeichen, a-z 0-9 . _ -).');
    process.exit(1);
  }
  if (sub === 'del') {
    delete users[name];
    auth.writeUsers(users);
    console.log(`Benutzer "${name}" gelöscht.`);
    return;
  }

  let pw;
  if (process.stdin.isTTY) {
    pw = await askHidden('Passwort: ');
    const pw2 = await askHidden('Passwort wiederholen: ');
    if (pw !== pw2) {
      console.error('Passwörter stimmen nicht überein.');
      process.exit(1);
    }
  } else {
    pw = await readStdinLine();
  }
  if (!pw || pw.length < 10) {
    console.error('Das Passwort muss mindestens 10 Zeichen lang sein.');
    process.exit(1);
  }
  const existed = name in users;
  users[name] = auth.hashPassword(pw);
  auth.writeUsers(users);
  console.log(existed ? `Passwort für "${name}" geändert.` : `Benutzer "${name}" angelegt.`);
}

main();
