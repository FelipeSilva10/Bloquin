import { readFile, writeFile } from 'node:fs/promises';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Faltou o valor da opção --${key}.`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const required = ['version', 'notes-file', 'signature-file', 'windows-url', 'out'];
for (const key of required) {
  if (!args[key]) throw new Error(`Faltou a opção obrigatória --${key}.`);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(args.version)) {
  throw new Error(`Versão inválida: ${args.version}`);
}

const notes = (await readFile(args['notes-file'], 'utf8')).trim();
const signature = (await readFile(args['signature-file'], 'utf8')).trim();
if (!signature) throw new Error(`Assinatura vazia em ${args['signature-file']}.`);

const manifest = {
  version: args.version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: args['windows-url'],
    },
  },
};

await writeFile(args.out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifesto do updater gerado: ${args.out} (v${args.version})`);
