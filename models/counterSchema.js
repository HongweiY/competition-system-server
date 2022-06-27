// 用户id
const mongoose = require('mongoose')
const Schema = mongoose.Schema
const counterSchema = new Schema({
    _id: String,
    sequenceValue: Number

})

module.exports = mongoose.model('counter', counterSchema, 'counters')
