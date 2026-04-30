require('dotenv').config();
const express = require('express');
const path = require('path');
const { connect } = require('http2');
const alertRoutes = require('./src/routes/alert');
const { connectDB } = require('./src/config/db');
const userRoutes = require('./src/routes/user');


const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

// Middleware
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Static Files - Pointing to the public folder where your team works
app.use(express.static(path.join(__dirname, 'public')));

// Modular Routes
app.use('/api/alerts', alertRoutes);

app.use('/api/users', userRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html'), (err) => {
        if (err) {
            res.status(404).send("Frontend files not found in /public folder.");
        }
    });
});

app.listen(PORT, () => {
    console.log(`\n================================================`);
    console.log(`🛡️  RAKSHAK O1 - SYSTEM ONLINE`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
    console.log(`================================================\n`);
});