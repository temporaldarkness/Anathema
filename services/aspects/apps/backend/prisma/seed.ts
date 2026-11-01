import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

let currentDir = process.cwd();
let envPath = '';
for (let i = 0; i < 5; i++) {
  const checkPath = path.join(currentDir, '.env');
  if (fs.existsSync(checkPath)) {
    envPath = checkPath;
    break;
  }
  currentDir = path.dirname(currentDir);
}

if (envPath) {
  console.log(`Загружаем .env из: ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.log('⚠️ Файл .env не найден в родительских директориях.');
  dotenv.config();
}

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCards } from '@aspects/cards';

if (!process.env.ASPECTS_DATABASE_URL) {
  console.error('❌ ОШИБКА: ASPECTS_DATABASE_URL не найден в переменных окружения!');
  console.error('Убедись, что файл .env существует.');
  process.exit(1);
}

const adapter = new PrismaPg({
  connectionString: process.env.ASPECTS_DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting seed...');

  // 1. Создаем рецепт бустера
  await prisma.boosterRecipe.upsert({
    where: { id: 'main-starter' },
    update: {},
    create: {
      id: 'main-starter',
      name: 'Стартовый бустер',
      description: '5 карт из основной игры',
      requiredShards: [
        { type: 'UNIVERSAL', rarity: 'COMMON', amount: 50 },
      ],
      dropWeights: {
        common: 0.7,
        uncommon: 0.2,
        rare: 0.08,
        epic: 0.018,
        legendary: 0.002,
      },
      poolSeries: ['classic', 'cradle', 'inner', 'throne', 'integration', 'cathedral'],
      cardsPerPack: 5,
      activeFrom: new Date('2026-01-01'),
    },
  });
  console.log('✅ Booster recipe "main-starter" created.');

  // 2. Выдача стартовых карт всем пользователям
  const users = await prisma.user.findMany();
  if (users.length === 0) {
    console.log('⚠️ No users found. Skipping starter decks grant.');
    return;
  }

  const classicCards = getCards('classic');
  const starterPool = classicCards.filter(
    (c) => !c.isToken && (c.rarity === 'common' || c.rarity === 'uncommon')
  );

  if (starterPool.length === 0) {
    console.log('⚠️ No starter cards found in classic pack.');
    return;
  }

  let grantedCount = 0;

  for (const user of users) {
    const existing = await prisma.userCollection.count({
      where: { userId: user.id },
    });
    
    // Если у пользователя уже есть карты, пропускаем
    if (existing > 0) continue;

    for (const card of starterPool) {
      await prisma.userCollection.create({
        data: {
          userId: user.id,
          cardDefId: card.id,
          count: 2, // Даем по 2 копии
          hasBlueprint: true,
          upgradeLevel: 0,
        },
      });
      grantedCount++;
    }
  }

  console.log(`✅ Granted starter cards to users (${grantedCount} total).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });