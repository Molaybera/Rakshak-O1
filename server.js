const express = require('express');
const path = require('path');
const alertRoutes = require('./src/routes/alert');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static Files - Pointing to the public folder where your team works
app.use(express.static(path.join(__dirname, 'public')));

// Modular Routes
app.use('/api/alerts', alertRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            res.status(404).send("Frontend files not found in /public folder.");
        }
    });
});

app.listen(PORT, () => {
    console.log(`\n================================================`);
    console.log(`🛡️  RAKSHAK O1 - SYSTEM ONLINE`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
    console.log(`📡 Alert API: http://localhost:${PORT}/api/alerts/trigger`);
    console.log(`================================================\n`);
});