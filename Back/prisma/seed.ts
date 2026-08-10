import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

async function main() {
  const alice = await prisma.user.upsert({
    where: { email: 'alice@chat.dev' },
    update: { password: await hash('secret123', BCRYPT_ROUNDS) },
    create: {
      email: 'alice@chat.dev',
      name: 'Alice',
      password: await hash('secret123', BCRYPT_ROUNDS),
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@chat.dev' },
    update: { password: await hash('secret123', BCRYPT_ROUNDS) },
    create: {
      email: 'bob@chat.dev',
      name: 'Bob',
      password: await hash('secret123', BCRYPT_ROUNDS),
    },
  });

  const room = await prisma.room.upsert({
    where: { id: 'sala-geral' },
    update: {},
    create: {
      id: 'sala-geral',
      name: 'Sala Geral',
      createdBy: alice.id,
    },
  });

  await prisma.user.update({
    where: { id: alice.id },
    data: { rooms: { connect: { id: room.id } } },
  });
  await prisma.user.update({
    where: { id: bob.id },
    data: { rooms: { connect: { id: room.id } } },
  });

  const msgCount = await prisma.message.count({ where: { roomId: room.id } });
  if (msgCount === 0) {
    await prisma.message.create({
      data: {
        content: 'Olá mundo! Bem-vindo ao chat em tempo real',
        roomId: room.id,
        senderId: alice.id,
      },
    });
  }

  console.log('Seed concluído:');
  console.log('  Alice -> alice@chat.dev / secret123');
  console.log('  Bob   -> bob@chat.dev / secret123');
  console.log('  Sala  -> sala-geral');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
