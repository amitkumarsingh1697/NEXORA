const mongoose = require('mongoose');
const { Schema } = mongoose;

const commentSchema = new Schema({
  body: { type: String, required: true },
  author: { type: Schema.Types.ObjectId, ref: 'Person' },
  tags: [String],
  meta: { votes: Number, favs: { type: Number, default: 0 } },
}, { timestamps: true });

module.exports = mongoose.model('Comment', commentSchema);
const Person = mongoose.model('Person', new Schema({ name: String }), 'people_v2');
