import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(__dirname, '.env'),
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../../../.env'),
];

for (const p of candidates) {
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.ASPECTS_DATABASE_URL ?? '',
  },
});