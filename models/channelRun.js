const mongoose = require('mongoose');
const publishRunSchema = require('./publishRunSchema');

// Same checkpoint structure as StatusRun, in its own collection, so a Channel
// run can never be mistaken for (or suppress) a Status run.
module.exports = mongoose.model('ChannelRun', publishRunSchema.clone());
