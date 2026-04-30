const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

/**
 * Handles biometric enrollment and authorized personnel retrieval.
 */

// POST /api/users/enroll - Save a new face embedding
router.post('/enroll', userController.enrollUser);

// GET /api/users/list - Fetch all authorized users
router.get('/list', userController.listUsers);

// DELETE /api/users/:id - Remove a user by MongoDB ID
router.delete('/:id', userController.deleteUser);

module.exports = router;