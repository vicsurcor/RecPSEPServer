const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto-js');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());

// SQLite database setup
const db = new sqlite3.Database('database.db');

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// User authentication route
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = crypto.SHA256(password).toString();

    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, 
        [username, hashedPassword], 
        (err, row) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Error authenticating user');
            } else if (!row) {
                res.status(401).send('Invalid username or password');
            } else {
                res.status(200).send('Authentication successful');
            }
        }
    );
});

// Route for storing user data
app.post('/register', (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = crypto.SHA256(password).toString();

    db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
        [username, email, hashedPassword],
        (err) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Error registering user');
            } else {
                res.status(200).send('User registered successfully');
            }
        }
    );
});

// Route for handling chat messages
app.post('/chat', (req, res) => {
    const { username, message } = req.body;

    db.run(`INSERT INTO messages (username, message) VALUES (?, ?)`,
        [username, message],
        (err) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Error sending message');
            } else {
                res.status(200).send('Message sent successfully');
            }
        }
    );
});

// Route for retrieving chat messages
app.get('/messages', (req, res) => {
    db.all(`SELECT * FROM messages ORDER BY timestamp ASC`, (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Error retrieving messages');
        } else {
            res.status(200).json(rows);
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});