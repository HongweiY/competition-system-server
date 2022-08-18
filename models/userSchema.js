/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const userSchema = new Schema({
    userId: Number,
    username: String,
    city: String,
    depart: String,
    phone: String,
    img: String,
    divisionId:Number,
    userPwd:String,
    role: {
        type: Number, default: 1
    }, // 0.系統管理员 1.昔通用户
    createTime: {
        type: Date, default: Date.now()
    },
    lastLoginTime: {
        type: Date, default: Date.now()
    } // 更新时间
})

module.exports = mongoose.model('users', userSchema, 'users')
