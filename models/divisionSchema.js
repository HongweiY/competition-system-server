/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const divisionSchema = new Schema({
    id: Number,
    title: String,
    createTime: {
        type: Date, default: Date.now()
    },
    lastLoginTime: {
        type: Date, default: Date.now()
    } // 更新时间
})

module.exports = mongoose.model('division', divisionSchema, 'division')
