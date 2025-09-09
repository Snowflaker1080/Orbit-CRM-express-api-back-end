const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/groups', require('./groups'));
router.use('/contacts', require('./contacts'));
router.use('/reminders', require('./reminders'));
router.use('/invites', require('./invites'));

module.exports = router;