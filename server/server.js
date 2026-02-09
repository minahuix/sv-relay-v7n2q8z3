const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Store active connections: sessionId -> Set<WebSocket>
const sessions = new Map();

// Heartbeat interval to keep connections alive
const HEARTBEAT_INTERVAL = 30000;

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  console.log('New client connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const { type, sessionId, senderId, payload } = message;

      if (!sessionId) return;

      // Handle Join/Create logic implicitly
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, new Set());
        console.log(`Created session: ${sessionId}`);
      }

      const sessionClients = sessions.get(sessionId);
      
      // Add client to session if not already present
      if (!sessionClients.has(ws)) {
        sessionClients.add(ws);
        ws.sessionId = sessionId; // Tag socket with session ID
        console.log(`Client joined session: ${sessionId}`);
      }

      // Relay message to all OTHER clients in the session
      sessionClients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });

      // Special handling for 'leave' messages
      if (type === 'leave') {
        sessionClients.delete(ws);
        if (sessionClients.size === 0) {
          sessions.delete(sessionId);
          console.log(`Session ${sessionId} is empty and removed.`);
        }
      }

    } catch (e) {
      console.error('Error processing message:', e);
    }
  });

  ws.on('close', () => {
    // Cleanup if socket disconnects abruptly
    if (ws.sessionId && sessions.has(ws.sessionId)) {
      const sessionClients = sessions.get(ws.sessionId);
      sessionClients.delete(ws);
      if (sessionClients.size === 0) {
        sessions.delete(ws.sessionId);
        console.log(`Session ${ws.sessionId} removed (all clients disconnected).`);
      }
    }
    console.log('Client disconnected');
  });
});

// Ping/Pong to keep connections alive
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
  clearInterval(interval);
});

console.log(`SharePlay Relay Server running on port ${PORT}`);
