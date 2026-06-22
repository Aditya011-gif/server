async function test() {
  const playlistId = 'PLgxs93BSP-hrI_pMZT28kVmGcvfFq234b';
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    const html = await response.text();
    
    const regex = /ytInitialData\s*=\s*({.+?});/s;
    const match = html.match(regex);
    if (!match) {
      console.log('No match');
      return;
    }
    
    const data = JSON.parse(match[1]);
    let pathsFound = 0;
    
    function findPaths(obj, currentPath = 'data') {
      if (pathsFound >= 5) return;
      if (!obj || typeof obj !== 'object') return;
      
      if (obj.videoId) {
        console.log(`Path ${++pathsFound}: ${currentPath} -> videoId: ${obj.videoId}`);
      }
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          findPaths(item, `${currentPath}[${index}]`);
        });
      } else {
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            findPaths(obj[key], `${currentPath}.${key}`);
          }
        }
      }
    }
    
    findPaths(data);
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
