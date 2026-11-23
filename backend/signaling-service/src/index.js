const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 4003;
const JWT_SECRET = process.env.JWT_SECRET || 'auracall-super-secure-jwt-key-9923847';

const wss = new WebSocketServer({ port: PORT });

// room Map: roomId -> Set of client WebSockets
const rooms = new Map();

wss.on('connection', (ws, req) => {
  // Extract token from query: ?token=...
  const urlParams = new URLSearchParams(req.url.replace(/^.*\?/, ''));
  const token = urlParams.get('token');

  let user = null;
  if (token) {
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch {
      console.warn('[SIGNALING] Unauthorized token or mock token attached');
      user = { sub: 'usr_guest_' + Math.random().toString(36).substring(2, 6) };
    }
  } else {
    user = { sub: 'usr_guest_' + Math.random().toString(36).substring(2, 6) };
  }

  ws.userId = user.sub;
  ws.email = user.email || 'guest@auracall.internal';
  ws.currentRoom = null;

  console.log(`[SIGNALING] Client connected: ${ws.userId} (${ws.email})`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      const { type, payload } = message;

      switch (type) {
        case 'join-room': {
          const { roomId } = payload;
          ws.currentRoom = roomId;

          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
          }
          rooms.get(roomId).add(ws);

          // Notify existing peers
          broadcastToRoom(roomId, ws, {
            type: 'peer-joined',
            payload: { peerId: ws.userId, email: ws.email },
          });

          ws.send(JSON.stringify({
            type: 'room-joined',
            payload: { roomId, peerId: ws.userId },
          }));
          break;
        }

        case 'signal-offer':
        case 'signal-answer':
        case 'ice-candidate':
        case 'chat-message':
        case 'network-tier-update': {
          if (ws.currentRoom) {
            broadcastToRoom(ws.currentRoom, ws, {
              type,
              payload: { ...payload, senderId: ws.userId, senderEmail: ws.email },
            });
          }
          break;
        }

        default:
          console.log(`[SIGNALING] Unhandled event: ${type}`);
      }
    } catch (err) {
      console.error('[SIGNALING] Invalid message packet received:', err);
    }
  });

  ws.on('close', () => {
    if (ws.currentRoom && rooms.has(ws.currentRoom)) {
      const room = rooms.get(ws.currentRoom);
      room.delete(ws);
      if (room.size === 0) {
        rooms.delete(ws.currentRoom);
      } else {
        broadcastToRoom(ws.currentRoom, ws, {
          type: 'peer-left',
          payload: { peerId: ws.userId },
        });
      }
    }
    console.log(`[SIGNALING] Client disconnected: ${ws.userId}`);
  });
});

function broadcastToRoom(roomId, senderWs, packet) {
  const room = rooms.get(roomId);
  if (!room) return;
  const str = JSON.stringify(packet);
  for (const client of room) {
    if (client !== senderWs && client.readyState === 1 /* OPEN */) {
      client.send(str);
    }
  }
}

console.log(`[SIGNALING-SERVICE] WebSocket server listening on port ${PORT}`);
