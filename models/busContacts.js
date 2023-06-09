const mongoose = require("mongoose");

const contactsSchema = new mongoose.Schema({
  date: {
    type: String,
    required: false,
  },
  product: { type: String, required: false },
  number: {
    type: String,
    required: false,
  },
  group: { type: String, required: false },
  notifyName: {
    type: String,
    required: false,
  },
  serialisedNumber: {
    type: String,
    required: true,
  },
});

const contactsModel = mongoose.model("contacts", contactsSchema);

module.exports = contactsModel;
