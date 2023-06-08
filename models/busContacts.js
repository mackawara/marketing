const mongoose = require("mongoose");

const contactsSchema = new mongoose.Schema({
  date: {
    type: String,
    required: false,
  },
  product: { type: String, required: false },
  number: {
    type: String,
    required: true,
  },
  group: { type: String, required: false },
  notifyName: {
    type: String,
    required: true,
  },
  serialisedNumber: {
    type: String,
    required: true,
  },
});

const contactsModel = mongoose.model("contacts", contactsSchema);

module.exports = contactsModel;
