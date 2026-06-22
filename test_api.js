const youtubesearchapi = require('youtube-search-api');
async function test() {
  try {
    const playlist = await youtubesearchapi.GetPlaylistData('PLgxs93BSP-hrI_pMZT28kVmGcvfFq234b');
    console.log('Playlist keys:', Object.keys(playlist));
    console.log('Playlist items length:', playlist.items ? playlist.items.length : 'none');
    if (playlist.items && playlist.items.length > 0) {
      console.log('First video:', JSON.stringify(playlist.items[0]));
    }
  } catch (e) {
    console.error(e);
  }
}
test();
