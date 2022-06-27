const router = require('koa-router')()
const util = require('../utils/util')
const roles = require('../models/rolesSchema')

router.prefix('/roles')
// 获取全部角色
router.get('/allList', async (ctx) => {
    try {
        const list = await roles.find({}, { _id: 1, roleName: 1 }) || []
        ctx.body = util.success(list)
    } catch (e) {
        ctx.body = util.fail(`查询失败${e.stack}`)
    }
})
// 获取角色列表
router.get('/list', async (ctx) => {
    const { page, skipIndex } = util.pager(ctx.request.query)
    const { roleName } = ctx.request.query
    const params = {}
    if (roleName) {
        params.roleName = {
            $regex: roleName,
            $options: 'i'
        }
    }
    try {
        const list = await roles.find(params, {}, { skip: skipIndex, limit: page.pageSize }).exec() || []
        const total = await roles.countDocuments(params)
        ctx.body = util.success({
            page: {
                ...page,
                total
            },
            list
        })
    } catch (e) {
        ctx.body = util.fail(`查询失败${e.stack}`)
    }
})
// 添加/编辑角色
router.post('/operate', async (ctx) => {
    const { _id, action, ...params } = ctx.request.body
    try {
        let res, msg
        if (action === 'edit') {
            res = await roles.findByIdAndUpdate({ _id }, params)
            msg = '编辑成功'
        } else {
            res = await roles.create(params)
            msg = '添加成功'
        }
        if (res) {
            ctx.body = util.success({}, msg)
        } else {
            ctx.body = util.fail('操作异常')
        }
    } catch (e) {
        ctx.body = util.fail(`系统异常${e.stack}`)
    }
})
// 删除角色
router.post('/del', async (ctx) => {
    const _id = ctx.request.body
    try {
        const res = await roles.findByIdAndRemove(_id)
        if (res) {
            ctx.body = util.success('', '删除成功')
        } else {
            ctx.body = util.fail('系统异常')
        }
    } catch (e) {
        ctx.body = util.fail(`删除失败${e.stack}`)
    }
})

// 角色权限更新
router.post('/permission/update', async (ctx) => {
    const { _id, permissionList } = ctx.request.body
    try {
        await roles.findByIdAndUpdate(_id, { permissionList })
        ctx.body = util.success({}, '更新成功')
    } catch (e) {
        ctx.body = util.fail(`查询失败${e.stack}`)
    }
})
module.exports = router
