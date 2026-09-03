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
    // Was `Unique` (capital U). Mongoose ignores unknown schema keys, so no
    // index was ever built and duplicate group rows accumulated — which meant
    // advertService could broadcast to the same group more than once per run.
    // De-duplicate the collection before deploying or the index build fails.
    unique: true,
  },
});

const busGroupsModel = mongoose.model("bizGroups", busGroupsSchema);

module.exports = busGroupsModel;
