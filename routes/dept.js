const router = require('koa-router')()
const dept = require('../models/deptSchema')
const util = require('../utils/util')
router.prefix('/dept')

router.get('/list', async (ctx) => {
    const { deptName } = ctx.request.query
    const params = {}
    if (deptName) {
        console.log('deptName')
        params.deptName = {
            $regex: deptName, $options: 'i'
        }
        const deptList = await dept.find(params)
        ctx.body = util.success(deptList)
    }
    const deptList = await dept.find()
    const list = getTreeDept(deptList, null, [])
    ctx.body = util.success(list)
})

function getTreeDept (rootList, id, list) {
    for (let i = 0; i < rootList.length; i++) {
        const item = rootList[i]
        if (String(item.parentId.slice().pop()) === String(id)) {
            list.push(item._doc)
        }
    }
    // 组装子节点
    list.forEach(item => {
        item.children = []
        getTreeDept(rootList, item._id, item.children)
        if (item.children.length === 0) {
            delete item.children
        }
    })
    return list
}

router.post('/operate', async (ctx) => {
    const { _id, action, ...params } = ctx.request.body
    let res, info
    try {
        if (action === 'edit') {
            res = await dept.findByIdAndUpdate(_id, params)
            info = '编辑成功'
        } else {
            res = await dept.create(params)
            info = '添加成功'
        }
    } catch (e) {
        ctx.body = util.fail(`操作失败${e.stack}`)
    }
    ctx.body = util.success(res, info)
})
router.post('/delete', async (ctx) => {
    const { _id } = ctx.request.body
    await dept.findByIdAndDelete(_id)
    await dept.deleteMany({ parentId: { $all: [_id] } })
    ctx.body = util.success({}, '删除成功')
})
module.exports = router
