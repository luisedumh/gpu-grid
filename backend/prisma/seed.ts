import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const sourceCode = `#include <cstdio>
__global__ void hola() { printf("Hola desde el hilo %d\\n", threadIdx.x); }
int main() { hola<<<1, 4>>>(); cudaDeviceSynchronize(); return 0; }
`;
const hace = (min: number) => new Date(Date.now() - min * 60_000);

async function main() {
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
  console.log('Seed completado: 6 trabajos de ejemplo');
}

main().finally(() => prisma.$disconnect());
