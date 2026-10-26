/**
 * ============================================================================
 * CryptLnk — Lightweight Ephemeral Signaling Server
 * ============================================================================
 * 
 * Architecture:
 * - Built on Node.js using native 'http' and the 'ws' WebSocket library.
 * - Zero Storage: No database, no file writes, no logs of messages or keys.
 * - Strictly acts as an ephemeral discovery relay for WebRTC SDP offer/answer
 *   and ICE candidate exchange.
 * - Once the WebRTC DataChannel is established between the two peers, all
 *   encrypted communications bypass this server entirely.
 * 
 * Author: Pranav Aitha (https://github.com/pranav-aitha)
 * License: MIT
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;

// Serve index.html and static files for effortless zero-config local runs
const server = http.createServer((req, res) => {
    // Basic CORS & Security headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);

    // Prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // SPA fallback to index.html
                fs.readFile(path.join(__dirname, 'index.html'), (spaErr, spaContent) => {
                    if (spaErr) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('404 Not Found');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(spaContent);
                    }
                });
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        } else {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.json': 'application/json',
                '.png': 'image/png',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon'
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(content);
        }
    });
});

// Ephemeral in-memory room tracking: Map<roomId, Set<WebSocket>>
// Strict policy: Max 2 peers per room for private 1-to-1 P2P sessions.
const rooms = new Map();

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    let currentRoomId = null;

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (message) => {
        // Enforce maximum payload size (64 KB) to protect against DoS
        if (message.length > 65536) {
            ws.send(JSON.stringify({ type: 'error', message: 'Payload too large' }));
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(message);
        } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON payload' }));
            return;
        }

        const { type, roomId, payload } = parsed;

        switch (type) {
            case 'join': {
                if (!roomId || typeof roomId !== 'string' || roomId.length > 64) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid Room ID' }));
                    return;
                }

                currentRoomId = roomId;

                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Set());
                }

                const room = rooms.get(roomId);

                if (room.size >= 2) {
                    ws.send(JSON.stringify({
                        type: 'room-full',
                        message: 'This secure session already has 2 connected participants.'
                    }));
                    return;
                }

                room.add(ws);

                if (room.size === 1) {
                    // First peer in the room: waiting for second peer
                    ws.send(JSON.stringify({
                        type: 'waiting',
                        message: 'Session created. Waiting for peer to connect...'
                    }));
                } else if (room.size === 2) {
                    // Second peer connected: Notify both peers
                    // The first peer becomes initiator (creates WebRTC offer)
                    const peers = Array.from(room);
                    const [initiator, joiner] = peers;

                    initiator.send(JSON.stringify({
                        type: 'peer-joined',
                        isInitiator: true,
                        message: 'Peer joined. Initiating cryptographic WebRTC handshake...'
                    }));

                    joiner.send(JSON.stringify({
                        type: 'peer-joined',
                        isInitiator: false,
                        message: 'Connected to session host. Awaiting handshake offer...'
                    }));
                }
                break;
            }

            case 'signal': {
                // Forward WebRTC SDP offer, SDP answer, or ICE candidate to the other peer in the room
                if (!currentRoomId || !rooms.has(currentRoomId)) return;

                const room = rooms.get(currentRoomId);
                for (const client of room) {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'signal',
                            payload: payload
                        }));
                    }
                }
                break;
            }

            case 'leave': {
                cleanupClient(ws, currentRoomId);
                break;
            }

            default:
                break;
        }
    });

    ws.on('close', () => {
        cleanupClient(ws, currentRoomId);
    });

    ws.on('error', () => {
        cleanupClient(ws, currentRoomId);
    });
});

/**
 * Clean up a disconnected client and notify remaining peer
 */
function cleanupClient(ws, roomId) {
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.delete(ws);

    if (room.size === 0) {
        // Zero lingering state: purge empty room instantly from memory
        rooms.delete(roomId);
    } else {
        // Notify the remaining peer that their conversation partner left
        for (const peer of room) {
            if (peer.readyState === WebSocket.OPEN) {
                peer.send(JSON.stringify({
                    type: 'peer-disconnected',
                    message: 'Your peer disconnected. Session terminated.'
                }));
            }
        }
    }
}

// Heartbeat to prune orphaned dead sockets every 30 seconds
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🔒 CryptLnk Signaling Server running on port ${PORT}`);
    console.log(`🌐 Local Web Client: http://localhost:${PORT}`);
    console.log(`⚡ WebSocket Signaling: ws://localhost:${PORT}`);
    console.log(`🛡️  Zero logs • Zero database • Ephemeral memory`);
    console.log(`==================================================\n`);
});
