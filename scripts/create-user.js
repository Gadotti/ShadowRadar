'use strict';

require('dotenv').config();

const readline = require('readline');
const bcrypt = require('bcrypt');
const { getDb } = require('../src/db/connection');
const { runMigrations } = require('../src/db/migrate');
const userRepository = require('../src/repositories/userRepository');

const BCRYPT_ROUNDS = 12;
const ROLE_OPTIONS = [
  { key: '1', value: 'reader', label: 'Leitor' },
  { key: '2', value: 'editor', label: 'Editor' },
];

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// Prints the prompt normally, then suppresses echo while the password is typed.
function askPassword(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    let muted = false;
    rl._writeToOutput = (str) => {
      if (!muted) process.stdout.write(str);
    };

    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });

    muted = true;
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

  console.log('\nPapel:');
  for (const opt of ROLE_OPTIONS) console.log(`  ${opt.key}) ${opt.label}`);
  const roleChoice = (await ask(rl, 'Escolha [1/2]: ')).trim();
  const roleOption = ROLE_OPTIONS.find((opt) => opt.key === roleChoice);
  if (!roleOption) {
    rl.close();
    console.error(`Opção inválida: "${roleChoice}". Use 1 (Leitor) ou 2 (Editor).`);
    process.exit(1);
  }
  const role = roleOption.value;

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
