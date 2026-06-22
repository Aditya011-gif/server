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
    const arrayParents = new Set();
    
    function findArrayParents(obj, parentKey = '') {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        // Check if any element in the array has navigationEndpoint and watchEndpoint
        const hasVideo = obj.some(item => 
          item && typeof item === 'object' && 
          item.navigationEndpoint && 
          item.navigationEndpoint.watchEndpoint
        );
        if (hasVideo && parentKey) {
          arrayParents.add(parentKey);
        }
      }
      
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          findArrayParents(obj[key], key);
        }
      }
    }
    
    findArrayParents(data);
    console.log('Array keys containing video elements:', Array.from(arrayParents));
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
