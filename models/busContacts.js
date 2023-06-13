const mongoose = require("mongoose");

const busGroupsSchema = new mongoose.Schema({
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
    Unique: true,
  },
});

const busGroupsModel = mongoose.model("bizGroups", busGroupsSchema);

module.exports = busGroupsModel;
