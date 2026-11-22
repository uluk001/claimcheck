// Validates manifest.yml with the same validator the Forge CLI uses, without needing a login.
const path = require('node:path');
const manifest = require('@forge/manifest');

manifest
  .validate(false, path.join(__dirname, '..', 'manifest.yml'))
  .then((result) => {
    for (const error of result.errors ?? []) console.error(`${error.level ?? 'error'}: ${error.message}`);
    if (!result.success) process.exit(1);
    console.log('manifest.yml is valid');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
