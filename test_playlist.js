const ytSearch = require('yt-search');
async function test() {
  try {
    const playlist = await ytSearch({ listId: 'PLgxs93BSP-hrI_pMZT28kVmGcvfFq234b' });
    console.log('Playlist keys:', Object.keys(playlist));
    console.log('Playlist Title:', playlist.title);
    console.log('Videos length:', playlist.videos ? playlist.videos.length : 'none');
    if (playlist.videos && playlist.videos.length > 0) {
      console.log('First video in playlist:', JSON.stringify(playlist.videos[0]));
    }
  } catch (e) {
    console.error(e);
  }
}
test();
