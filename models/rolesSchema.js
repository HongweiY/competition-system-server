const mongoose = require('mongoose')
const Schema = mongoose.Schema

const roleSchema = new Schema({
    roleName: String,
    remark: String,
    permissionList: {
        checkedKeys: [],
        halfCheckKeys: []
    },
    createTime: {
        type: Date,
        default: Date.now()
    }
})

module.exports = mongoose.model('roles', roleSchema, 'roles')
