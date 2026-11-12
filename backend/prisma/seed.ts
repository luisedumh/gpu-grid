import 'dotenv/config';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

const sourceCode = `#include <cstdio>
__global__ void hola() { printf("Hola desde el hilo %d\\n", threadIdx.x); }
int main() { hola<<<1, 4>>>(); cudaDeviceSynchronize(); return 0; }
`;
const hace = (min: number) => new Date(Date.now() - min * 60_000);

/** One account of each type. All of them use the password "password123". */
const usuarios = [
  { name: 'Cliente de prueba', email: 'cliente@gpugrid.dev', role: 'CLIENT' },
  { name: 'Proveedor de prueba', email: 'proveedor@gpugrid.dev', role: 'PROVIDER' },
  { name: 'Administrador de prueba', email: 'admin@gpugrid.dev', role: 'ADMIN' },
] as const;

async function main() {
  await prisma.user.deleteMany();
  const passwordHash = await hashPassword('password123');
  await prisma.user.createMany({ data: usuarios.map((u) => ({ ...u, passwordHash })) });

  await prisma.job.deleteMany();
  await prisma.job.createMany({
    data: [
      {
        name: 'Suma de vectores',
        sourceCode,
        status: 'COMPLETED',
        exitCode: 0,
        durationMs: 1840,
        stdout: 'Hola desde el hilo 0\nHola desde el hilo 1\n',
        startedAt: hace(30),
        finishedAt: hace(29),
      },
      { name: 'Multiplicación de matrices', sourceCode, status: 'RUNNING', startedAt: hace(2) },
      { name: 'Histograma', sourceCode, status: 'QUEUED' },
      {
        name: 'Reducción paralela',
        sourceCode,
        status: 'COMPILE_FAILED',
        compilerOutput: 'error: identifier "blockDimx" is undefined',
      },
      {
        name: 'Bucle infinito',
        sourceCode,
        status: 'TIMED_OUT',
        timeoutSeconds: 10,
        startedAt: hace(60),
        finishedAt: hace(59),
      },
      { name: 'Convolución 2D', sourceCode, status: 'PENDING' },
    ],
  });
  console.log('Seed completado: 3 usuarios (uno de cada tipo) y 6 trabajos de ejemplo');
}

main().finally(() => prisma.$disconnect());
