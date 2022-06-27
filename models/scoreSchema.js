/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const scoreSchema = new Schema({
    scoreId: Number,
    competeId: Number,
    userId: {
        type:mongoose.Types.ObjectId,
        ref:'users'
    },
    score:Number,
    scoreMust:Number,
    scoreDisuse:Number,
    scoreFinal:Number,
    answer_time:Number,
    answer_number:Number,
    accuracy_number:Number,
    accuracy:Number,
    createTime: {
        type: Date, default: Date.now()
    },
    lastUpdateTime: {
        type: Date, default: Date.now()
    } // 更新时间
})

module.exports = mongoose.model('scores', scoreSchema, 'scores')
