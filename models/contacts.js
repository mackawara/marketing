const mongoose = require("mongoose");

const groupContactSchema = new mongoose.Schema({
  pushname: {
    type: String,
    required: false,
    default: null,
  },
  phone: {
    // Not every contact resolves to a number. A plain unique index permits only
    // one document with the field absent, so a second unresolvable contact
    // failed with E11000 and never persisted — sparse makes the index skip
    // documents that have no phone at all.
    type: String,
    required: false,
    unique: true,
    sparse: true,
  },
  contactId: {
    type: String,
    required: true,
    unique: true,
  },
  groupsInCommon: {
    type: [String],
    default: [],
  },
  isBusiness: {
    type: Boolean,
    default: false,
  },
  savedName: {
    type: String,
    default: null,
  },
  firstSeen: {
    type: Date,
    default: Date.now,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

const GroupContact = mongoose.model("groupContacts", groupContactSchema);

module.exports = GroupContact;
