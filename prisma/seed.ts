import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed…');

  const hashedPassword = await bcrypt.hash('Mortadelo.82', 10);

  /* ───────── EMPRESA ───────── */
  const company = await prisma.company.create({
    data: {
      nif: 'J39875158',
      legalName: 'Magic Saron SC',
      commercialName: 'Magic+',
      address: 'C/ San Lázaro 18, Sarón',
      plan: 'PRO',
    },
  });

  /* ───────── SUCURSAL ───────── */
  const branch = await prisma.branch.create({
    data: {
      name: 'Sarón',
      address: 'Sarón',
      companyId: company.id,
    },
  });

  /* ───────── USUARIO GLOBAL ───────── */
  const user = await prisma.user.create({
    data: {
      name: 'Pablo',
      firstSurname: 'Esteban',
      secondSurname: 'Losada',
      dni: '72064540C',
      email: 'termigol82@gmail.com',
      password: hashedPassword,
      active: true,
    },
  });

  /* ───────── MEMBERSHIP (CLAVE) ───────── */
  await prisma.membership.create({
    data: {
      userId: user.id,
      companyId: company.id,
      branchId: branch.id,
      role: Role.SUPERADMIN,
      active: true,
    },
  });

  console.log('✅ Seed ejecutado correctamente');
}

main()
  .catch(e => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });