/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const finalUserSchema = new Schema({
    userId: Number,
    username: String,
    city: String,
    depart: String,
    phone: String,
    img: String,
    cid: Number,//竞赛id
    rank: Number,//排名
    action: {
        type: String,
        default: 'none'
    },
    answer_time: {
        type: Number,
        default: 0
    },//答题用时
    answer_number: {
        type: Number,
        default: 0
    }, //答题数量
    accuracy_number: {
        type: Number,
        default: 0
    },//答对题目数量
    createTime: {
        type: Date, default: Date.now()
    },
    isChallenger: {
        type: Boolean, default: false
    }
})

module.exports = mongoose.model('finalUsers', finalUserSchema, 'finalUsers')
