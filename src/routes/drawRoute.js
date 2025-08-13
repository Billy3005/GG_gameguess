const express = require('express');
const router = express.Router();

const drawController = require('../app/controllers/drawController.js');

router.get('/gamePlay', drawController.index);

module.exports = router;
