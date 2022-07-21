const router = require('koa-router')()
const menuSchema = require('../models/menuSchema')
const util = require('../utils/util')

router.prefix('/menus')
router.get('/list', async (ctx) => {
    const { menuName, menuState } = ctx.request.query
    const params = {}
    if (menuName) params.menuName = { $regex: menuName, $options: 'i' }

    if (menuState === 1 || menuState === 2) params.menuState = menuState
    const rootList = await menuSchema.find(params) || []
    const menuList = getTreeMenu(rootList, null, [])
    ctx.body = util.success(menuList)
})

function getTreeMenu (rootList, id, list) {
    // 查询根节点
    for (let i = 0; i < rootList.length; i++) {
        const item = rootList[i]
        if (String(item.parentId.slice().pop()) === String(id)) {
            list.push(item._doc)
        }
    }
    // 组装子节点
    list.forEach(item => {
        item.children = []
        getTreeMenu(rootList, item._id, item.children)
        if (item.children.length === 0) {
            delete item.children
        } else if (item.children.length > 0 && item.children[0].menuType === 2) {
            item.action = item.children
        }
    })

    return list
}

// 创建删除菜单
router.post('/create', async (ctx) => {
    const { _id, action, ...params } = ctx.request.body
    let res, msg
    try {
        if (action === 'edit') {
            params.updateTime = Date.now()
            res = await menuSchema.findOneAndUpdate({ _id }, params)
            msg = '编辑成功'
        } else {
            // 创建
            delete params._id
            res = await menuSchema.create(params)
            msg = '添加成功'
        }
        if (res) {
            ctx.body = util.success({}, msg)
        } else {
            ctx.body = util.fail('系统异常')
        }
    } catch (e) {
        throw new Error(e)
    }
})

router.post('/del', async (ctx) => {
    const _id = ctx.request.body
    try {
        const res = await menuSchema.findByIdAndRemove(_id)
        const may = await menuSchema.deleteMany({ parentId: { $all: [_id] } })

        if (res) {
            ctx.body = util.success('', '删除成功')
        } else {
            ctx.body = util.fail('系统异常')
        }
    } catch (e) {
        throw new Error(e)
    }
})

module.exports = router
