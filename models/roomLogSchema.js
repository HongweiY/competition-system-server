/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const roomLogSchema = new Schema({
    uid: Number,// 题干
    roomId:mongoose.Types.ObjectId,
    rounds:Number,// 当前第几题
    cId: Number,
    rightNumber: Number,
    useTime: Number,
    type:String,//哪个模块的题目
    createTime: {
        type: Date, default: Date.now()
    }
})

module.exports = mongoose.model('roomLogs', roomLogSchema, 'roomLogs')
