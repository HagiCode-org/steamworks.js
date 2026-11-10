# Tests

This directory contains smoke tests for the steamworks.js library.

## Running Tests

Before running any tests, you need to build the project first:

```bash
pnpm run build:debug
```

### Offline Checks

These run without a Steam client, a Steam account or an AppID:

```bash
pnpm run test:offline   # module loads; init, workshop.addDependency and workshop.removeDependency are exported
pnpm run test:types     # strict TypeScript check of test/typescript/index.ts against the generated typings
```

### Additional Previews Smoke Test

Tests the `ItemPreviewType` enum values are correctly exported:

```bash
node tests/additional-previews-smoke-test.js
```

### Manual Testing

For full integration testing with actual Steam Workshop items, you can create a manual test script. Example:

```javascript
const steamworks = require('./index.js');

// Initialize Steam client
const api = steamworks.init(480); // 480 is Steam's app ID for Spacewar

// Query workshop items with additional previews
async function test() {
  try {
    const item = await api.workshop.getItem(BigInt('123456'), {
      includeAdditionalPreviews: true
    });

    console.log('Workshop item:', item.title);
    console.log('Additional previews:', item.additionalPreviews);
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
```
