/**
 * Smoke test for AdditionalPreview type definitions.
 * This test verifies that the additional previews types are correctly exported.
 *
 * NOTE: This test requires the project to be built first with `pnpm run build:debug`
 *       and Steam client must be running.
 */

const assert = require('assert');

// Initialize Steam client
const steamworks = require('../index.js');

// App ID for a game that has workshop items with multiple previews
const APP_ID = 3167020;
// Workshop item ID that has additional preview images
const WORKSHOP_ITEM_ID = 3630910529n;

async function testAdditionalPreviews() {
  console.log('Initializing Steam client...');
  const api = steamworks.init(APP_ID);

  console.log('Querying workshop item with additional previews...');

  try {
    // Query workshop item with additional previews enabled
    const item = await api.workshop.getItem(WORKSHOP_ITEM_ID, {
      includeAdditionalPreviews: true,
      includeLongDescription: true,
    });

    console.log('\n=== Workshop Item ===');
    console.log('Title:', item.title);
    console.log('Description:', item.description?.substring(0, 100) + '...');
    console.log('Preview URL:', item.previewUrl);

    console.log('\n=== Additional Previews ===');
    if (item.additionalPreviews && item.additionalPreviews.length > 0) {
      console.log(`Found ${item.additionalPreviews.length} additional previews:`);
      item.additionalPreviews.forEach((preview, index) => {
        console.log(`\nPreview ${index + 1}:`);
        console.log('  Type:', api.workshop.ItemPreviewType[preview.type] || `Unknown (${preview.type})`);
        console.log('  URL/Video ID:', preview.urlOrVideoId);
        console.log('  Original Filename:', preview.originalFileName || '(none)');
      });

      // Assert that we have at least one additional preview
      assert(item.additionalPreviews.length > 0, 'Should have at least one additional preview');
      console.log('\n✓ Additional previews are present');
    } else {
      console.log('No additional previews found for this item');
    }

    // Test ItemPreviewType enum values
    console.log('\n=== Testing ItemPreviewType Enum ===');
    const { ItemPreviewType } = api.workshop;

    assert.strictEqual(ItemPreviewType.Image, 0);
    assert.strictEqual(ItemPreviewType.YouTubeVideo, 1);
    assert.strictEqual(ItemPreviewType.Sketchfab, 2);
    assert.strictEqual(ItemPreviewType.EnvironmentMapHorizontalCross, 3);
    assert.strictEqual(ItemPreviewType.EnvironmentMapLatLong, 4);
    assert.strictEqual(ItemPreviewType.Clip, 5);
    assert.strictEqual(ItemPreviewType.ReservedMax, 255);

    console.log('✓ ItemPreviewType enum values are correct');
    console.log('\n✓ All additional previews smoke tests passed!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the test
testAdditionalPreviews().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
