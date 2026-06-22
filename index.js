const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const ytSearch = require('yt-search');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Port configuration
const PORT = process.env.PORT || 3000;

// Room Database (in-memory)
const rooms = new Map();

// Helper to generate a unique 4-character uppercase room ID
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  do {
    result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(result));
  return result;
}

// Helpers for resilient playlist parsing
function parseDurationString(str) {
  if (!str) return 0;
  
  let seconds = 0;
  const hourMatch = str.match(/(\d+)\s*hour/);
  const minMatch = str.match(/(\d+)\s*minute/);
  const secMatch = str.match(/(\d+)\s*second/);
  
  if (hourMatch) seconds += parseInt(hourMatch[1]) * 3600;
  if (minMatch) seconds += parseInt(minMatch[1]) * 60;
  if (secMatch) seconds += parseInt(secMatch[1]);
  
  if (seconds > 0) return seconds;
  
  const parts = str.split(':').map(Number);
  if (parts.every(p => !isNaN(p))) {
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  
  return 0;
}

function extractVideosFromInitialData(data) {
  const videos = [];
  const seenIds = new Set();
  
  function findLockups(obj) {
    if (!obj || typeof obj !== 'object') return;
    
    if (obj.lockupViewModel) {
      const vm = obj.lockupViewModel;
      const videoId = vm.contentId;
      if (videoId && typeof videoId === 'string' && vm.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
        if (!seenIds.has(videoId)) {
          seenIds.add(videoId);
          
          let title = '';
          if (vm.metadata && vm.metadata.lockupMetadataViewModel && vm.metadata.lockupMetadataViewModel.title) {
            title = vm.metadata.lockupMetadataViewModel.title.content || '';
          }
          
          let channel = 'Unknown Channel';
          try {
            const rows = vm.metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows;
            if (rows && rows.length > 0 && rows[0].metadataParts && rows[0].metadataParts.length > 0) {
              channel = rows[0].metadataParts[0].text.content || 'Unknown Channel';
            }
          } catch (e) {
            // ignore
          }
          
          let thumbnail = '';
          try {
            const sources = vm.contentImage.thumbnailViewModel.image.sources;
            if (sources && sources.length > 0) {
              thumbnail = sources[0].url || '';
            }
          } catch (e) {
            // ignore
          }
          
          if (!thumbnail && videoId) {
            thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          }
          
          let duration = 0;
          try {
            if (vm.contentImage && vm.contentImage.thumbnailViewModel && vm.contentImage.thumbnailViewModel.overlays) {
              for (const overlay of vm.contentImage.thumbnailViewModel.overlays) {
                if (overlay.thumbnailOverlayTimeStatusRenderer && overlay.thumbnailOverlayTimeStatusRenderer.text) {
                  const timeStr = overlay.thumbnailOverlayTimeStatusRenderer.text.simpleText;
                  if (timeStr) {
                    duration = parseDurationString(timeStr);
                    break;
                  }
                }
              }
            }
          } catch (e) {
            // ignore
          }
          
          if (duration === 0) {
            try {
              const label = vm.rendererContext.accessibilityContext.label;
              if (label) {
                duration = parseDurationString(label);
              }
            } catch (e) {
              // ignore
            }
          }
          
          videos.push({
            videoId,
            title,
            duration,
            thumbnail,
            channel
          });
        }
      }
    }
    
    if (Array.isArray(obj)) {
      obj.forEach(findLockups);
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          findLockups(obj[key]);
        }
      }
    }
  }
  
  findLockups(data);
  return videos;
}

// REST Endpoint: Get Authoritative Server Time
app.get('/api/time', (req, res) => {
  res.json({ time: Date.now() });
});

// REST Endpoint: Search YouTube Videos or Playlists
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const type = req.query.type || 'video'; // 'video', 'playlist', or 'yt_music'
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    console.log(`Searching YouTube for: "${query}" (Type: ${type})`);
    
    if (type === 'playlist') {
      const results = await ytSearch(query);
      const formatted = (results.playlists || []).slice(0, 15).map(playlist => ({
        playlistId: playlist.listId,
        title: playlist.title || 'Unknown Playlist',
        videoCount: playlist.videoCount || 0,
        thumbnail: playlist.thumbnail || playlist.image || '',
        channel: playlist.author ? playlist.author.name : 'Unknown Creator',
      }));
      return res.json(formatted);
    } else {
      let searchQuery = query;
      if (type === 'yt_music') {
        searchQuery = `${query} official audio`;
      }
      
      const results = await ytSearch(searchQuery);
      const formatted = (results.videos || []).slice(0, 20).map(video => ({
        videoId: video.videoId,
        title: video.title || 'Unknown Title',
        duration: video.seconds || 0,
        thumbnail: video.thumbnail || video.image || '',
        channel: video.author ? video.author.name : 'Unknown Channel',
      }));
      return res.json(formatted);
    }
  } catch (error) {
    console.error('Error searching YouTube:', error);
    res.status(500).json({ error: 'Failed to search YouTube videos' });
  }
});

// REST Endpoint: Get Videos in a Playlist using resilient custom scraper
app.get('/api/playlist/videos', async (req, res) => {
  const playlistId = req.query.id;
  if (!playlistId) {
    return res.status(400).json({ error: 'Query parameter "id" (playlist ID) is required' });
  }

  try {
    console.log(`Fetching videos for playlist ID: ${playlistId} using resilient custom scraper`);
    const url = `https://www.youtube.com/playlist?list=${playlistId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch playlist page: ${response.statusText}`);
    }
    
    const html = await response.text();
    const regex = /ytInitialData\s*=\s*({.+?});/s;
    const match = html.match(regex);
    if (!match) {
      throw new Error('Could not find ytInitialData in YouTube playlist page HTML');
    }
    
    const data = JSON.parse(match[1]);
    const videos = extractVideosFromInitialData(data);
    
    // Limit to first 35 videos to avoid performance degradation
    const formatted = videos.slice(0, 35);
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching playlist videos:', error);
    res.status(500).json({ error: 'Failed to retrieve videos from this playlist/album' });
  }
});

// Socket.io Real-time logic
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Create Room
  socket.on('create_room', ({ nickname }) => {
    const roomId = generateRoomId();
    const newRoom = {
      roomId,
      hostId: socket.id,
      members: [{ id: socket.id, nickname: nickname || 'Anonymous' }],
      currentVideo: null,
      playback: {
        isPlaying: false,
        currentTime: 0,
        lastUpdated: Date.now(),
      },
      queue: [],
      chat: [{
        id: `sys-${Date.now()}`,
        sender: 'System',
        text: `${nickname || 'Anonymous'} created the room.`,
        timestamp: Date.now()
      }],
    };

    rooms.set(roomId, newRoom);
    socket.join(roomId);
    
    // Associate room ID and nickname with the socket session
    socket.roomId = roomId;
    socket.nickname = nickname || 'Anonymous';

    socket.emit('room_created', roomId);
    io.to(roomId).emit('room_state', newRoom);
    console.log(`Room created: ${roomId} by Host: ${nickname} (${socket.id})`);
  });

  // 2. Join Room
  socket.on('join_room', ({ roomId, nickname }) => {
    const code = roomId.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error_msg', 'Room not found. Please check the code.');
      return;
    }

    // Add user to room members
    const newMember = { id: socket.id, nickname: nickname || 'Anonymous' };
    room.members.push(newMember);
    socket.join(code);

    socket.roomId = code;
    socket.nickname = nickname || 'Anonymous';

    // System notification in chat
    room.chat.push({
      id: `sys-${Date.now()}`,
      sender: 'System',
      text: `${nickname || 'Anonymous'} joined the party.`,
      timestamp: Date.now()
    });

    io.to(code).emit('room_state', room);
    console.log(`User ${nickname} (${socket.id}) joined room ${code}`);
  });

  // 3. Playback Synchronization Actions (Only process if room exists)
  socket.on('playback_action', ({ action, currentTime }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Optional: Only allow host to control, or allow anyone (we will let anyone control for collaborative fun!)
    const isHost = socket.id === room.hostId;

    room.playback.currentTime = currentTime;
    room.playback.lastUpdated = Date.now();

    if (action === 'play') {
      room.playback.isPlaying = true;
      io.to(roomId).emit('playback_play', { currentTime, timestamp: Date.now(), senderId: socket.id });
    } else if (action === 'pause') {
      room.playback.isPlaying = false;
      io.to(roomId).emit('playback_pause', { currentTime, senderId: socket.id });
    } else if (action === 'seek') {
      io.to(roomId).emit('playback_seek', { currentTime, senderId: socket.id });
    }

    // Keep server-side state in sync
    console.log(`Playback event [${action}] in Room ${roomId} at ${currentTime}s by ${socket.nickname}`);
  });

  // 4. Client Sync Heartbeat
  // Clients periodically report their state; if the host reports, the server updates its authoritative state.
  socket.on('playback_sync', ({ currentTime, isPlaying }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Host updates authoritative position
    if (socket.id === room.hostId) {
      room.playback.currentTime = currentTime;
      room.playback.isPlaying = isPlaying;
      room.playback.lastUpdated = Date.now();
      
      // Broadcast current position to all other clients in the room for real-time drift correction
      socket.to(roomId).emit('playback_sync_broadcast', {
        currentTime,
        isPlaying,
        timestamp: Date.now()
      });
    }
  });

  // 5. Add Song to Queue
  socket.on('add_song', (videoData) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Check if song already in queue or currently playing
    const inQueue = room.queue.some(song => song.videoId === videoData.videoId);
    const isCurrent = room.currentVideo && room.currentVideo.videoId === videoData.videoId;

    if (inQueue || isCurrent) {
      socket.emit('error_msg', 'This song is already in the queue or playing.');
      return;
    }

    const newSong = {
      videoId: videoData.videoId,
      title: videoData.title,
      thumbnail: videoData.thumbnail,
      duration: videoData.duration,
      channel: videoData.channel || 'Unknown',
      votes: [socket.id] // Initial vote from adder
    };

    // If no song is playing, make this the active song immediately
    if (!room.currentVideo) {
      room.currentVideo = {
        videoId: newSong.videoId,
        title: newSong.title,
        thumbnail: newSong.thumbnail,
        duration: newSong.duration,
        channel: newSong.channel
      };
      room.playback = {
        isPlaying: true, // auto play
        currentTime: 0,
        lastUpdated: Date.now()
      };
      
      room.chat.push({
        id: `sys-${Date.now()}`,
        sender: 'System',
        text: `Now playing: ${newSong.title}`,
        timestamp: Date.now()
      });
    } else {
      room.queue.push(newSong);
      
      room.chat.push({
        id: `sys-${Date.now()}`,
        sender: 'System',
        text: `${socket.nickname} added "${newSong.title}" to the queue.`,
        timestamp: Date.now()
      });
    }

    io.to(roomId).emit('room_state', room);
  });

  // 6. Upvote / Toggle Vote on Song
  socket.on('vote_song', ({ videoId }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const song = room.queue.find(s => s.videoId === videoId);
    if (!song) return;

    const voteIndex = song.votes.indexOf(socket.id);
    if (voteIndex > -1) {
      // Remove vote if already voted
      song.votes.splice(voteIndex, 1);
    } else {
      // Add vote
      song.votes.push(socket.id);
    }

    // Re-sort queue by number of votes (descending)
    room.queue.sort((a, b) => b.votes.length - a.votes.length);

    io.to(roomId).emit('room_state', room);
  });

  // 7. Remove Song from Queue
  socket.on('remove_song', ({ videoId }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Only host or the person who added it can remove it? For simple MVP, let anyone remove it but notify in chat
    const songIndex = room.queue.findIndex(s => s.videoId === videoId);
    if (songIndex > -1) {
      const removedSong = room.queue[songIndex];
      room.queue.splice(songIndex, 1);

      room.chat.push({
        id: `sys-${Date.now()}`,
        sender: 'System',
        text: `${socket.nickname} removed "${removedSong.title}" from the queue.`,
        timestamp: Date.now()
      });

      io.to(roomId).emit('room_state', room);
    }
  });

  // 8. Skip Current Song (Go to next)
  socket.on('skip_song', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    playNextSong(room);
  });

  // Helper to play next song in queue
  function playNextSong(room) {
    if (room.queue.length > 0) {
      // Take first song (since queue is sorted by votes)
      const nextSong = room.queue.shift();
      room.currentVideo = {
        videoId: nextSong.videoId,
        title: nextSong.title,
        thumbnail: nextSong.thumbnail,
        duration: nextSong.duration,
        channel: nextSong.channel
      };
      room.playback = {
        isPlaying: true,
        currentTime: 0,
        lastUpdated: Date.now()
      };

      room.chat.push({
        id: `sys-${Date.now()}`,
        sender: 'System',
        text: `Now playing: ${nextSong.title}`,
        timestamp: Date.now()
      });
    } else {
      // No more songs
      room.currentVideo = null;
      room.playback = {
        isPlaying: false,
        currentTime: 0,
        lastUpdated: Date.now()
      };
      
      room.chat.push({
        id: `sys-${Date.now()}`,
        sender: 'System',
        text: "The queue is empty. Add some songs to keep the party going!",
        timestamp: Date.now()
      });
    }

    io.to(room.roomId).emit('room_state', room);
  }

  // 9. Video Finished Playback
  socket.on('video_finished', ({ videoId }) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Verify the finished video is indeed the active one
    if (room.currentVideo && room.currentVideo.videoId === videoId) {
      console.log(`Video finished: ${videoId} in room ${roomId}. Auto-playing next.`);
      playNextSong(room);
    }
  });

  // 10. Send Chat Message
  socket.on('send_message', (text) => {
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      sender: socket.nickname,
      text,
      timestamp: Date.now()
    };

    room.chat.push(message);
    // Limit chat history to last 100 messages
    if (room.chat.length > 100) {
      room.chat.shift();
    }

    io.to(roomId).emit('room_state', room);
  });

  // 11. Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const roomId = socket.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Remove member from list
    room.members = room.members.filter(member => member.id !== socket.id);

    // System notification in chat
    room.chat.push({
      id: `sys-${Date.now()}`,
      sender: 'System',
      text: `${socket.nickname || 'Someone'} left the party.`,
      timestamp: Date.now()
    });

    if (room.members.length === 0) {
      // Room is empty, destroy it after a small buffer time or instantly
      console.log(`Room ${roomId} is empty. Deleting.`);
      rooms.delete(roomId);
    } else {
      // If host left, designate a new host
      if (room.hostId === socket.id) {
        room.hostId = room.members[0].id;
        room.chat.push({
          id: `sys-${Date.now()}`,
          sender: 'System',
          text: `${room.members[0].nickname} is now the host.`,
          timestamp: Date.now()
        });
        console.log(`New host for Room ${roomId}: ${room.members[0].nickname}`);
      }
      io.to(roomId).emit('room_state', room);
    }
  });
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`SyncMusic Server is running on http://localhost:${PORT}`);
  console.log(`Accessible on local network using your machine's IP (e.g. 192.168.x.x:${PORT})`);
});
