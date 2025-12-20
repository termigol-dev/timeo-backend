const bcrypt = require('bcryptjs');

async function test() {
  const password = 'admin123';

  const hash = await bcrypt.hash(password, 10);
  console.log('Password plano:', password);
  console.log('Hash generado:', hash);

  const ok = await bcrypt.compare(password, hash);
  console.log('¿Coincide el password?', ok);
}

test();