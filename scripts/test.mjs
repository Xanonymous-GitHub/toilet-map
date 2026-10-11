import {spawnSync} from 'node:child_process';
for (const file of ['tests/core.test.ts', 'tests/api.test.ts']) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', file], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
