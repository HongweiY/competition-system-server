/**
 *
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const competeSchema = new Schema({
    cId: Number,
    title: String,
    scores: Number,
    create_uid: Number,
    create_username: String,
    startTime: String,
    endTime: String,
    finalUser:{ //决赛人数
      type:Number,
      default:100
    },
    screenings: {
        type: Number,
        default: 3
    },
    currentType: {
        type: String,
        default: 'must'
        //状态 1 正常状态 2 删除
    },
    finalRounds: {//终极排位赛轮次
        type: Number,
        default: 1

    },
    createTime: {
        type: Date, default: Date.now()
    },
    updateTime: {
        type: Date, default: Date.now()
    } // 更新时间
    ,
    state: {
        type: Number, default: 1
        //状态 1 正常状态 2 删除
    }

})

module.exports = mongoose.model('competes', competeSchema, 'compete')
