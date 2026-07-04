const { Innertube, Platform } = require('youtubei.js');

// Custom JS interpreter for deciphering signatures in Node.js environment
Platform.shim.eval = (data) => {
  const code = typeof data === 'object' && data.output ? data.output : data;
  return new Function(code)();
};

async function test() {
  try {
    console.log('Initializing Innertube...');
    const yt = await Innertube.create();
    const videoId = 'xCHsyht5eac';
    
    const clients = ['YTMUSIC', 'MWEB', 'ANDROID'];
    
    for (const clientName of clients) {
      console.log(`\n--- Testing client: ${clientName} ---`);
      try {
        const info = await yt.getInfo(videoId, { client: clientName });
        const audioFormat = info.chooseFormat({ type: 'audio', quality: 'best' });
        if (!audioFormat) {
          console.log(`No audio formats found for client ${clientName}`);
          continue;
        }
        
        console.log('Deciphering audio stream URL...');
        const streamUrl = await audioFormat.decipher(yt.session.player);
        console.log(`Stream URL successfully resolved for ${clientName}! (Length: ${streamUrl ? streamUrl.length : 0})`);
      } catch (e) {
        console.error(`Client ${clientName} failed:`, e.stack || e.message);
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();
