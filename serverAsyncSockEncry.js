const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto-js');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());

// SQLite database setup
const db = new sqlite3.Database('database.db');

// Promisify database functions for async/await
const { promisify } = require('util');
const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

// Encryption key
const encryptionKey = 'mySecretKey123!'; // Make sure to use a secure key in production

// Function to encrypt a message
const encryptMessage = (message) => {
    return crypto.AES.encrypt(message, encryptionKey).toString();
};

// Function to decrypt a message
const decryptMessage = (encryptedMessage) => {
    const bytes = crypto.AES.decrypt(encryptedMessage, encryptionKey);
    return bytes.toString(crypto.enc.Utf8);
};

// Create tables if they don't exist
db.serialize(async () => {
    await dbRun(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
    )`);

    await dbRun(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        location TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Route for retrieving users
app.get('/users', async (req, res) => {
    try {
        const rows = await dbAll(`SELECT * FROM users`);
        res.status(200).json(rows);
        console.log(rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error retrieving users');
    }
});

// User authentication route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = crypto.SHA256(password).toString();

    try {
        const row = await dbGet(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, hashedPassword]);
        if (!row) {
            res.status(401).send('Invalid username or password');
        } else {
            res.status(200).send('Authentication successful');
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error authenticating user');
    }
});

// Route for registering users
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = crypto.SHA256(password).toString();

    try {
        await dbRun(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, [username, email, hashedPassword]);
        res.status(200).send('User registered successfully');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error registering user');
    }
});

// Route for handling chat messages
app.post('/chat', async (req, res) => {
    const { username, location, message } = req.body;
    const encryptedMessage = encryptMessage(message);

    try {
        await dbRun(`INSERT INTO messages (username, location, message) VALUES (?, ?, ?)`, [username, location, encryptedMessage]);
        res.status(200).send('Message sent successfully');
        console.log(encryptedMessage);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error sending message');
    }
});

// Route for retrieving chat messages
app.get('/messages', async (req, res) => {
    try {
        const rows = await dbAll(`SELECT * FROM messages ORDER BY timestamp ASC`);
        const decryptedMessages = rows.map(row => ({
            ...row,
            message: decryptMessage(row.message)
        }));
        res.status(200).json(decryptedMessages);
        console.log(decryptedMessages);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error retrieving messages');
    }
});

// HTTP server
const server = http.createServer(app);

// Setup socket.io
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Limit the number of connections to 10
let connectionCount = 0;

io.on('connection', (socket) => {
    if (connectionCount >= 10) {
        console.log('Too many connections. Disconnecting socket.');
        socket.disconnect(true);
        return;
    }

    connectionCount++;
    console.log(`New client connected. Total connections: ${connectionCount}`);

    socket.on('disconnect', () => {
        connectionCount--;
        console.log(`Client disconnected. Total connections: ${connectionCount}`);
    });

    // Handle incoming messages from clients
    socket.on('chat message', async (msg) => {
        const { username, location, message } = msg;
        const encryptedMessage = encryptMessage(message);

        try {
            await dbRun(`INSERT INTO messages (username, location, message) VALUES (?, ?, ?)`, [username, location, encryptedMessage]);
            const broadcastMessage = {
                ...msg,
                message: encryptedMessage
            };
            io.emit('chat message', broadcastMessage);  // Broadcast the encrypted message to all clients
            console.log(encryptedMessage);
        } catch (err) {
            console.error('Error sending message:', err.message);
        }
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
