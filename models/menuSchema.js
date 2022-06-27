/**
 * 菜单模型
 */
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const menuSchema = new Schema({
    parentId: [mongoose.Types.ObjectId],
    menuType: Number,
    menuName: String,
    icon: String,
    path: String,
    component: String,
    menuState: Number,
    menuCode: String,
    createTime: {
        type: Date, default: Date.now()
    },
    updateTime: {
        type: Date, default: Date.now()
    }

})

module.exports = mongoose.model('menus', menuSchema, 'menus')
