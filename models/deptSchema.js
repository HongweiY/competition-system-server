const mongoose = require('mongoose')
const Schema = mongoose.Schema
const deptSchema = new Schema({
    deptName: String,
    userId: String,
    userName: String,
    userEmail: String,
    parentId: [mongoose.Types.ObjectId],
    createTime: {
        type: Date, default: Date.now()
    },
    updateTime: {
        type: Date, default: Date.now()
    }
})

module.exports = mongoose.model('departments', deptSchema, 'departments')
