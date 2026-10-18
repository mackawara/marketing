const mongoose = require('mongoose');
const publishRunSchema = require('./publishRunSchema');

module.exports = mongoose.model('StatusRun', publishRunSchema);
