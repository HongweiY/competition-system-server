/**
 * 用户管理模块
 *
 */
const router = require('koa-router')()
const User = require('../models/userSchema')
const Menu = require('../models/menuSchema')
const Role = require('../models/rolesSchema')
const util = require('../utils/util')
const jwt = require('jsonwebtoken')
const md5 = require('md5')
const Counter = require('../models/counterSchema')
router.prefix('/users')

router.post('/login', async(ctx) => {
    try {
        const {username, userPwd} = ctx.request.body
        const res = await User.findOne({
            username, userPwd: md5(userPwd)
        }, 'userId username role')
        if(res) {
            const data = res._doc
            const token = jwt.sign({
                data: data
            }, 'ymfsder', {expiresIn: 60 * 60 * 24})
            data.token = token
            ctx.body = util.success(data)
        } else {
            ctx.body = util.fail('账号密码不正确')
        }
    } catch(e) {
        ctx.body = util.fail(e.msg)
    }
})

// 用户列表
router.get('/list', async(ctx) => {
    const {username, city, depart, phone} = ctx.request.query
    const {page, skipIndex} = util.pager(ctx.request.query)
    const params = {}
    params.role=1
    if(username) {
        params.username = {
            $regex: username, $options: 'i'
        }
    }
    if(phone) {
        params.phone = {
            $regex: phone, $options: 'i'
        }
    }
    if(city) {
        params.city = {
            $regex: city, $options: 'i'
        }
    }
    if(depart) {
        params.depart = {
            $regex: depart, $options: 'i'
        }
    }

    try {
        const list = await User.find(params, {userPwd: 0}, {skip: skipIndex, limit: page.pageSize}).exec()
        const total = await User.countDocuments(params)
        ctx.body = util.success({
            page: {
                ...page, total
            },
            list
        })
    } catch(e) {
        ctx.body = util.fail(`查询异常${e.stack}`)
    }
})

router.get('/allUsers', async(ctx) => {
    const list = await User.find({}, {userId: 1, userName: 1, userEmail: 1})
    ctx.body = util.success(list)
})
// 新增用户
router.post('/create', async(ctx) => {
    const {deptId, job, mobile, role, roleList, state, userEmail, userName, _id, action} = ctx.request.body
    let res
    if(action === 'edit') {
        // 编辑
        if(!deptId) {
            ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        }
        res = await User.findOneAndUpdate({_id: _id}, {deptId, job, mobile, role, roleList, state})
        if(res) {
            ctx.body = util.success({}, '操作成功')
        }
    } else {
        // 添加
        if(!deptId || !userName || !userEmail) {
            ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        }
        // 判断系统是否存在用户
        const exitUser = await User.findOne({$or: [{userName}, {userEmail}]}, '_id userName userEmail')
        if(exitUser) {
            ctx.body = util.fail(`添加失败。原因：用户名：${exitUser.userName}；用户邮箱：${exitUser.userEmail}的用户已存在`)
            return
        }
        const counterDoc = await Counter.findOneAndUpdate({_id: 'userId'}, {$inc: {sequenceValue: 1}}, {new: true})
        const result = await User.create({
            userId: counterDoc.sequenceValue,
            deptId,
            userPwd: md5('123456'),
            job,
            mobile,
            roleList,
            state,
            userEmail,
            userName,
            role: 1
        })
        if(result) {
            ctx.body = util.success({}, '添加成功')
        } else {
            ctx.body = util.fail('数据库异常')
        }
    }
})
// 编辑用户
// todo
// 删除用户
router.post('/delete', async(ctx) => {
    const {ids} = ctx.request.body
    // todo
    const res = await User.updateMany({_id: {$in: ids}}, {state: 2})
    if(res) {
        ctx.body = util.success(res, `共删除${res.matchedCount}条`)
        return
    }
    ctx.body = util.fail('删除失败')
})
// 根据用户权限获取对应的菜单
router.get('/permission', async(ctx) => {
    const authorization = ctx.request.headers.authorization
    const token = authorization.split(' ')[1]
    const {data} = jwt.decode(token)
    const menuList = await getMenuList(data.role, data.roleList)
    const treeMenu = util.getTreeMenu(menuList, null, [])
    const actionList = getActionList(JSON.parse(JSON.stringify(menuList)))
    ctx.body = util.success({menuList: treeMenu, actionList})
})

// 获取菜单列表
async function getMenuList(role, roleKeys) {
    let menuRoot = []
    if(role === 0) {
        // 超级管理
        menuRoot = await Menu.find() || []
    } else {
        // 根据权限获取菜单
        const roleList = await Role.find({_id: {$in: roleKeys}}) || []
        let menuIds = []
        // eslint-disable-next-line array-callback-return
        roleList.map(role => {
            const {checkedKeys, halfCheckKeys} = role.permissionList
            menuIds = menuIds.concat([...checkedKeys, ...halfCheckKeys])
        })
        menuIds = [...new Set(menuIds)]
        menuRoot = await Menu.find({_id: {$in: menuIds}})
    }
    return menuRoot
}

// 获取按钮列表
function getActionList(list) {
    const actionList = []
    const deep = (arr) => {
        while(arr.length) {
            const item = arr.pop()
            if(item.action) {
                // eslint-disable-next-line array-callback-return
                item.action.map(action => {
                    actionList.push(action.menuCode)
                })
            }
            if(!item.action && item.children) {
                deep(item.children)
            }
        }
    }
    deep(list)
    return actionList
}

module.exports = router
