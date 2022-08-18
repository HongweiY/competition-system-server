/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const sysConfSchema = new Schema({
    title: String,
    content: Number,
    createTime: {
        type: Date, default: Date.now()
    },
    lastLoginTime: {
        type: Date, default: Date.now()
    } // 更新时间
})

module.exports = mongoose.model('sysConf', sysConfSchema, 'sysConf')
