import { PrismaClient, Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed…')

  const hashedPassword = await bcrypt.hash('Mortadelo.82', 10)

  /* ───────── EMPRESA ───────── */
  const company = await prisma.company.upsert({
    where: { nif: 'J39875158' },
    update: {},
    create: {
      nif: 'J39875158',
      legalName: 'Magic Saron SC',
      commercialName: 'Magic+',
      address: 'C/ San Lázaro 18, Sarón',
      plan: 'PRO',
    },
  })

  /* ───────── SUCURSAL ───────── */
  const branch = await prisma.branch.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: 'Sarón',
      },
    },
    update: {},
    create: {
      name: 'Sarón',
      address: 'Sarón',
      companyId: company.id,
    },
  })

  /* ───────── USUARIO ───────── */
  const user = await prisma.user.upsert({
    where: { email: 'termigol82@gmail.com' },
    update: {},
    create: {
      name: 'Pablo',
      firstSurname: 'Esteban',
      secondSurname: 'Losada',
      dni: '72064540C',
      email: 'termigol82@gmail.com',
      password: hashedPassword,
      active: true,
    },
  })

  /* ───────── MEMBERSHIP ───────── */
  await prisma.membership.upsert({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId: company.id,
      },
    },
    update: {
      role: Role.SUPERADMIN,
      active: true,
      branchId: branch.id,
    },
    create: {
      userId: user.id,
      companyId: company.id,
      branchId: branch.id,
      role: Role.SUPERADMIN,
      active: true,
    },
  })

  console.log('✅ Seed ejecutado correctamente (SUPERADMIN listo)')
}

main()
  .catch(e => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })