/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const answerLogSchema = new Schema({
    uid: Number,// 题干
    penId: Number,
    roomId:mongoose.Types.ObjectId,
    rounds:Number,//
    cid: Number,
    postAnswer: String,//标签
    isRight: Boolean,
    useTime: Number,
    type:String,//哪个模块的题目
    createTime: {
        type: Date, default: Date.now()
    }
})

module.exports = mongoose.model('answerLogs', answerLogSchema, 'answerLogs')
