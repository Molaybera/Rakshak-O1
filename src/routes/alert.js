const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');


//   /api/alerts/trigger
router.post('/trigger', alertController.handleAlert);

module.exports = router;