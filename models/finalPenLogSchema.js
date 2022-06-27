/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const finalPenLogSchema = new Schema({
    cid: Number,//竞赛id
    round: Number,//轮数
    penId: Number,
    penInfo: Array,//题目
    penNumber: Number,//第几题
    pushTime: {
        type: Date, default: Date.now()
    }
})

module.exports = mongoose.model('finalPenLogs', finalPenLogSchema, 'finalPenLogs')
