const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');


//   /api/alerts/trigger
router.post('/trigger', alertController.handleAlert);

//   /api/alerts/list
router.get('/list', alertController.getAlerts);

//   /api/alerts/:id
router.delete('/:id', alertController.deleteAlert);

module.exports = router;