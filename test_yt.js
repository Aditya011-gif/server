const { Innertube, Platform } = require('youtubei.js');

// Custom JS interpreter for deciphering signatures
Platform.shim.eval = (data) => {
  console.log('Platform.shim.eval called!');
  console.log('typeof data:', typeof data);
  console.log('data keys (if object):', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
  console.log('data preview:', typeof data === 'string' ? data.slice(0, 100) : JSON.stringify(data).slice(0, 100));
  
  // Try both
  const code = typeof data === 'object' && data.output ? data.output : data;
  return new Function(code)();
};

async function test() {
  try {
    console.log('Initializing Innertube...');
    const yt = await Innertube.create();
    const videoId = 'LUgpPmj6nR8';
    
    console.log('Fetching info for video...');
    const info = await yt.getInfo(videoId, { client: 'TV' });
    
    console.log('Selecting audio format...');
    const audioFormat = info.chooseFormat({ type: 'audio', quality: 'best' });
    
    console.log('Deciphering audio stream URL...');
    const streamUrl = await audioFormat.decipher(yt.session.player);
    console.log('\nDeciphered Stream URL successfully resolved!');
    console.log('Stream URL:', streamUrl);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();
