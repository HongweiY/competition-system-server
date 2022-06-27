/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const matchSchema = new Schema({
    mId: Number,
    cid: Number,//竞赛id
    type: String,//匹配类型 must  disuse
    userCount: Number,//当前房间人数
    userOneId: {
        type: Schema.Types.ObjectId,
        ref: 'users'
    },
    userTwoId: {
        type: Schema.Types.ObjectId,
        ref: 'users'
    },
    userThreeId: {
        type: Schema.Types.ObjectId,
        ref: 'users'
    },
    userFourId: {
        type: Schema.Types.ObjectId,
        ref: 'users'
    },
    createTime: {
        type: Date, default: Date.now()
    },
    state: {
        type: Number, default: 1
        //状态 1 匹配中 2 正在比赛 3当前房间答题已结束
    },
    pushTime: {
        type: Date//推送时间
    },
    pushPen: Array,
    currentRound: {
        type: Number,
        default: 1
    }//当前轮数


})

module.exports = mongoose.model('match', matchSchema, 'match')
