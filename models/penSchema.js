/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const penSchema = new Schema({
    penId: Number,
    stem: String,// 题干
    penType: String,//题目类型 单选，多选，判断，填空，问答
    tags: String,//标签
    analyze: String,
    degree: {//易，中，难
        type: String,
        default: '易'
    },
    isRandom: {
        type: Boolean,
        default: true
    },
    answer: String,
    options: Array,
    createTime: {
        type: Date, default: Date.now()
    }
})

module.exports = mongoose.model('pens', penSchema, 'pens')
