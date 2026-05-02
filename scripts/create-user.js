'use strict';

require('dotenv').config();

const readline = require('readline');
const bcrypt = require('bcrypt');
const { getDb } = require('../src/db/connection');
const { runMigrations } = require('../src/db/migrate');
const userRepository = require('../src/repositories/userRepository');

const BCRYPT_ROUNDS = 12;
const VALID_ROLES = ['reader', 'editor'];

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// Suppresses echo for password input; resolves with the typed value.
function askPassword(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    // Suppress all characters written back to stdout (hides the password).
    rl._writeToOutput = () => {};

    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  let db;
  try {
    db = getDb();
    runMigrations(db);
  } catch (err) {
    console.error(`\nErro ao abrir o banco de dados: ${err.message}`);
    console.error('Execute "npm run db:migrate" antes de criar usuários.');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n--- Criar novo usuário ---\n');

  const name = (await ask(rl, 'Nome de exibição: ')).trim();
  if (!name) { rl.close(); console.error('Nome é obrigatório.'); process.exit(1); }

  const username = (await ask(rl, 'Usuário (login): ')).trim().toLowerCase();
  if (!username) { rl.close(); console.error('Usuário é obrigatório.'); process.exit(1); }

  const role = (await ask(rl, 'Papel [reader/editor]: ')).trim().toLowerCase();
  if (!VALID_ROLES.includes(role)) {
    rl.close();
    console.error(`Papel inválido: "${role}". Use "reader" ou "editor".`);
    process.exit(1);
  }

  rl.close();

  const password = await askPassword('Senha: ');
  if (!password) { console.error('Senha é obrigatória.'); process.exit(1); }

  const confirm = await askPassword('Confirmar senha: ');
  if (password !== confirm) {
    console.error('\nAs senhas não coincidem.');
    process.exit(1);
  }

  const existing = userRepository.findByUsername(db, username);
  if (existing) {
    console.error(`\nErro: o usuário "${username}" já existe.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  userRepository.create(db, { name, username, passwordHash, role });

  console.log(`\nUsuário '${username}' criado com sucesso (papel: ${role}).`);
}

main().catch((err) => {
  console.error('\nErro inesperado:', err.message);
  process.exit(1);
});
