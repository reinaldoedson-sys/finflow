import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

interface TestResult {
  file: string;
  passed: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

function findTestFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function main(): void {
  const rootDir = process.cwd();
  const testDir = path.join(rootDir, 'test');
  const testFiles = findTestFiles(testDir);

  if (testFiles.length === 0) {
    console.error('Nenhum arquivo de teste encontrado em test/');
    process.exit(1);
  }

  console.log(`\n🔍 Descobertos ${testFiles.length} arquivos de teste em ${path.relative(rootDir, testDir)}/\n`);
  console.log('='.repeat(80));

  const results: TestResult[] = [];
  const suiteStartTime = Date.now();

  for (let i = 0; i < testFiles.length; i++) {
    const filePath = testFiles[i];
    const relPath = path.relative(rootDir, filePath);
    process.stdout.write(`[${i + 1}/${testFiles.length}] Executando ${relPath}... `);

    const startTime = Date.now();
    // Executa usando tsx diretamente via npx para garantir portabilidade cross-platform
    const child = spawnSync('npx', ['tsx', relPath], {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    const durationMs = Date.now() - startTime;
    const passed = child.status === 0;

    results.push({
      file: relPath,
      passed,
      durationMs,
      stdout: child.stdout || '',
      stderr: child.stderr || ''
    });

    if (passed) {
      console.log(`\x1b[32mPASS\x1b[0m (${(durationMs / 1000).toFixed(2)}s)`);
    } else {
      console.log(`\x1b[31mFAIL\x1b[0m (${(durationMs / 1000).toFixed(2)}s)`);
      if (child.stdout) console.log(child.stdout);
      if (child.stderr) console.error(child.stderr);
    }
  }

  const totalDurationMs = Date.now() - suiteStartTime;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.length - passedCount;

  console.log('='.repeat(80));
  console.log('\n📊 RESUMO GERAL DA SUÍTE DE TESTES:');
  console.log('-'.repeat(80));
  console.log(`${'STATUS'.padEnd(10)} | ${'TEMPO'.padStart(8)} | ARQUIVO`);
  console.log('-'.repeat(80));

  for (const r of results) {
    const statusText = r.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    const timeText = `${(r.durationMs / 1000).toFixed(2)}s`;
    console.log(`${statusText.padEnd(19)} | ${timeText.padStart(8)} | ${r.file}`);
  }

  console.log('-'.repeat(80));
  console.log(`Total de arquivos : ${results.length}`);
  console.log(`Sucessos          : \x1b[32m${passedCount}\x1b[0m`);
  console.log(`Falhas            : ${failedCount > 0 ? `\x1b[31m${failedCount}\x1b[0m` : '0'}`);
  console.log(`Tempo total       : ${(totalDurationMs / 1000).toFixed(2)}s\n`);

  if (failedCount > 0) {
    console.error(`❌ ${failedCount} arquivo(s) de teste falharam.`);
    process.exit(1);
  } else {
    console.log('🎉 Todos os arquivos de teste foram executados com sucesso!');
    process.exit(0);
  }
}

main();
