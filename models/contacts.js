const mongoose = require("mongoose");

const groupContactSchema = new mongoose.Schema({
  pushname: {
    type: String,
    required: false,
    default: null,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
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
