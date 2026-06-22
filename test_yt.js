const ytSearch = require('yt-search');
async function test() {
  try {
    // 1. Search for "lofi album" and look at playlists
    const r1 = await ytSearch('lofi album');
    console.log('r1 playlists count:', r1.playlists.length);
    if (r1.playlists.length > 0) {
      console.log('r1 first playlist:', JSON.stringify(r1.playlists[0]));
    }

    // 2. Search for "arijit singh playlist"
    const r2 = await ytSearch('arijit singh playlist');
    console.log('r2 playlists count:', r2.playlists.length);
    if (r2.playlists.length > 0) {
      console.log('r2 first playlist:', JSON.stringify(r2.playlists[0]));
    }
    
    // 3. Let's see the keys of a playlist item if found
  } catch (e) {
    console.error(e);
  }
}
test();
