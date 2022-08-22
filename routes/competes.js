/**
 * 用户管理模块
 *
 */
const router = require('koa-router')()
const Compete = require('../models/competeSchema')
const util = require('../utils/util')
router.prefix('/compete')
const dayjs = require('dayjs')
const User = require("../models/userSchema");
const Score = require("../models/scoreSchema");
const FinalUser = require("../models/finalUserSchema");
const Division = require("../models/divisionSchema")


// 竞赛列表
router.get('/list', async(ctx) => {
    const {page, skipIndex,} = util.pager(ctx.request.query)
    const {keyword} = ctx.request.query
    const params = {
        state: 1
    }
    if(keyword) {
        params.title = {
            $regex: keyword, $options: 'i'
        }
    }
    try {
        const list = await Compete.find(params, {}, {skip: skipIndex, limit: page.pageSize}).sort({cId: -1}).exec()
        const total = await Compete.countDocuments(params)
        ctx.body = util.success({
            page: {
                ...page, total
            }, list
        })
    } catch(e) {
        ctx.body = util.fail(`查询异常${e.stack}`)
    }
})

// 新增竞赛
router.post('/create', async(ctx) => {
    const {
        title,
        scores = 1000,
        create_uid,
        create_username,
        startTime,
        endTime,
        action,
        cId,
        screenings,
        currentType = 'must',
        finalUser = 100,
        division = '',
        divisionId = 0,
        competeType = 1,
        subject = '常规赛'
    } = ctx.request.body
    //判断时间
    if(dayjs(endTime).isBefore(dayjs(startTime))) {
        ctx.body = util.fail('参数异常,结束时间不得早于开始时间', util.CODE.PARAM_ERROR)
        return
    }
    const divisionInfo = await Division.findOne({id: divisionId}).exec()
    if(!divisionInfo) {
        await Division.create({id: divisionId, title: division})
    } else {
        await Division.updateOne({id: divisionId}, {title: division})
    }
    if(action === 'edit') {
        // 编辑

        if(!cId) {
            ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
            return
        }
        await Compete.updateOne({cId}, {
            title, scores, create_uid, create_username, startTime, endTime, divisionId, competeType, subject
        })
        ctx.body = util.success({}, '操作成功')
    } else {
        // 添加
        if(!title || !scores || !create_uid || !create_username || !startTime || !endTime) {
            ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
            return
        }
        // 判断系统是否存
        const exitCompete = await Compete.findOne({title}, '_id title')
        if(exitCompete) {
            ctx.body = util.fail(`添加失败。原因：竞赛名：${exitCompete.title}的竞赛已存在`)
            return
        }
        const result = await Compete.create({
            cId: await util.getAutoId('competeId'),
            title,
            scores,
            create_uid,
            create_username,
            startTime,
            endTime,
            currentType,
            screenings,
            finalUser,
            divisionId,
            competeType,
            subject
        })

        if(result) {
            ctx.body = util.success({
                "cid": result.cId,
                "title": result.title,
            }, '添加成功')
        } else {
            ctx.body = util.fail('数据库异常')
        }
    }
})

// 删除竞赛
router.post('/delete', async(ctx) => {
    const {ids} = ctx.request.body
    const res = await Compete.updateMany({cId: {$in: ids}}, {state: 2})
    if(res) {
        ctx.body = util.success(res, `共删除${res.matchedCount}条`)
        return
    }
    ctx.body = util.fail('删除失败')
})

/**
 * 终极排位赛推送
 */
router.post('/pushFinalPen', async(ctx) => {
    const {cid} = ctx.request.body
    await util.pushFinalPen(cid)
    ctx.body = util.success('推送定时任务')

})

/**
 * 赛区排行榜
 */
router.get('/divisionShow', async(ctx) => {

    const {page = 1, page_size = 20, cid} = ctx.request.query
    const competitionInfo = await Compete.findOne({cId: cid}).exec();
    if(!competitionInfo) {
        ctx.body = util.success({
            "canInert": false,
            "reason": '竞赛不存在'
        })
        return
    }
    const competeType = competitionInfo['competeType'];
    const competeDivisionId = competitionInfo['divisionId']
    const competeSubject = competitionInfo['subject']

    let list = []
    let total = 0
    let returnData = []
    const skipIndex = (page - 1) * page_size
    const sort = {
        score: -1,
        answer_time: 1
    }
    //查询当前赛区、当前类型的比赛
    const cIdList = await Compete.find({divisionId: competeDivisionId, competeType, subject: competeSubject},
        {
            'cId': 1,
            _id: 0
        })
    let cIdArr = []
    if(cIdList.length > 0) {
        for(const item of cIdList) {
            cIdArr.push(item.cId)
        }
    }
    try {
        list = await Score.find({competeId: {$in: cIdArr}}, {}, {
            skip: skipIndex, limit: page_size, sort: sort
        }).populate(['userId']).exec()
        total = await Score.countDocuments({competeId: {$in: cIdArr}})
    } catch(e) {
        ctx.body = util.fail(`查询异常${e.stack}`)
    }
    if(list) {
        for(let i = 0; i < list.length; i++) {
            let score = list[i]
            let username = score.userId.username
            if(username.length < 3) {
                username = username.substring(0, 1) + '*'
            } else {
                let mid = ''
                for(let j = 0; j < username.length - 2; j++) {
                    mid += '*'
                }
                username = username.substring(0, 1) + mid + username.substring(username.length - 1, username.length)
            }
            returnData.push({
                "username": username,
                "phone": score.userId.phone.substring(0, 3) + 'xxxx' + score.userId.phone.substring(7, 11),
                "rank": (page - 1) * page_size + i + 1,
                "answer_time": score.answer_time,
                "depart": score.userId.depart,
                "accuracy": score.accuracy ? (score.accuracy * 100).toFixed(2) + '%' : '0%',
                "score": score.score,
                "img": score.userId.img
            })
        }
    }
    ctx.body = util.success({
        "status": 200,
        "msg": "success",
        page: {
            ...page, total
        },
        data: returnData
    })


})

//观摩
router.get('/show', async(ctx) => {

    const {order = 'score', orderCondition = 'desc', page = 1, page_size = 20} = ctx.request.query
    const cid = ctx.request.query.cid
    const competitionInfo = await Compete.findOne({cId: cid}).exec()
    if(!competitionInfo) {
        ctx.body = util.fail('竞赛信息异常', util.CODE.PARAM_ERROR)
        return
    }

    const currentType = competitionInfo['currentType']
    let list = []
    let total = 0
    let returnData = []

    const skipIndex = (page - 1) * page_size


    let sort
    if(orderCondition === 'asc') {
        sort = {
            score: 1,
        }
        if(order === 'time') {
            sort = {
                answer_time: 1
            }
        }
        if(order === 'accuracy') {
            sort = {
                accuracy: 1
            }
        }
    } else {
        sort = {
            score: -1,
        }
        if(order === 'time') {
            sort = {
                answer_time: -1
            }
        }
        if(order === 'accuracy') {
            sort = {
                accuracy: -1
            }
        }
    }

    //判断当前用户是不是在终极排位赛
    if(currentType === 'final') {
        let sort = {
            rank: 1,
        }
        list = await FinalUser.find({cid}, {}, {
            skip: skipIndex, limit: page_size, sort: sort
        }).populate(['userId']).exec()
        total = competitionInfo['finalUser']
        if(list) {
            for(let i = 0; i < list.length; i++) {
                let finalUser = list[i]
                let username = finalUser.username
                if(username.length < 3) {
                    username = username.substring(0, 1) + '*'
                } else {
                    let mid = ''
                    for(let j = 0; j < username.length - 2; j++) {
                        mid += '*'
                    }
                    username = username.substring(0, 1) + mid + username.substring(username.length - 1, username.length)
                }
                returnData.push({
                    "username": username,
                    "phone": finalUser.phone.substring(0, 3) + 'xxxx' + finalUser.phone.substring(7, 11),
                    "rank": (page - 1) * page_size + i + 1,
                    "answer_time": finalUser.answer_time,
                    "depart": finalUser.answer_number,
                    "accuracy": finalUser.accuracy_number > 0 ? (finalUser.accuracy_number * 100 / finalUser.answer_number_number).toFixed(2) + '%' : '0%',
                    "score": finalUser.score,
                    "img": finalUser.img,
                    "action": finalUser.action
                })
            }
        }

    } else {
        try {
            list = await Score.find({competeId: cid}, {}, {
                skip: skipIndex, limit: page_size, sort: sort
            }).populate(['userId']).exec()
            total = await Score.countDocuments({competeId: cid})
        } catch(e) {
            ctx.body = util.fail(`查询异常${e.stack}`)
        }
        if(list) {
            for(let i = 0; i < list.length; i++) {
                let score = list[i]
                let username = score.userId.username
                if(username.length < 3) {
                    username = username.substring(0, 1) + '*'
                } else {
                    let mid = ''
                    for(let j = 0; j < username.length - 2; j++) {
                        mid += '*'
                    }
                    username = username.substring(0, 1) + mid + username.substring(username.length - 1, username.length)
                }
                returnData.push({
                    "username": username,
                    "phone": score.userId.phone.substring(0, 3) + 'xxxx' + score.userId.phone.substring(7, 11),
                    "rank": (page - 1) * page_size + i + 1,
                    "answer_time": score.answer_time,
                    "answer_number": score.answer_number,
                    "accuracy": score.accuracy ? (score.accuracy * 100).toFixed(2) + '%' : '0%',
                    "score": score.score,
                    "img": score.userId.img
                })
            }
        }
    }
    const TypeName = {
        'must': '四人必答赛',
        'disuse': '双人对战赛',
        'final': '终极排位赛'
    }
    ctx.body = util.success({
        "status": 200,
        "compete_type": TypeName[competitionInfo['currentType']],
        "msg": "success",
        page: {
            ...page, total
        },
        data: returnData
    })
})

/**
 * 判断用户能否进入竞赛
 */
router.post('/canInter', async(ctx) => {
    const {cid, token} = ctx.request.body
    //查询当前竞赛信息
    const competitionInfo = await Compete.findOne({cId: cid}).exec();
    if(!competitionInfo) {
        ctx.body = util.success({
            "canInert": false,
            "reason": '竞赛不存在'
        })
        return
    }

    const competeType = competitionInfo['competeType'];
    const competeDivisionId = competitionInfo['divisionId']
    const competeSubject = competitionInfo['subject']
    const {username, city, depart, phone, img, divisionId} = util.decrypt(token)
   //赛区限制
    if(competeDivisionId !== divisionId) {
        ctx.body = util.success({
            "canInert": false,
            "reason": '用户赛区与竞赛所属赛区不一致'
        })
        return
    }
    //选拔赛限制 1 常规赛； 2 选拔赛；3： 决赛

    if(competeType != 2) {
        ctx.body = util.success({
            "canInert": true
        })
        return
    }

    // 判断系统是否存在改用户
    if(!username || !city || !depart || !phone || !img || !divisionId) {
        ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        return
    }
    let exitUser = await User.findOne({$and: [{phone}, {username}]}, ['_id', 'userId', 'username', 'city', 'depart', 'phone', 'img']).exec()

    if(!exitUser) {
        ctx.body = util.success({
            "canInter": true
        })
    } else {
        //查询当前用户是否有当前赛区的当前类型的竞赛信息
        const cIdList = await Compete.find({divisionId: competeDivisionId, competeType, subject: competeSubject}, {'cId': 1, _id: 0})
        if(cIdList.length <= 0) {
            ctx.body = util.success({
                "canInter": true
            })
        } else {
            const cIdArr = []
            for(const item of cIdList) {
                if(item.cId !== cid) {
                    cIdArr.push(item.cId)
                }
            }
            const scoreCount = await Score.countDocuments({userId: exitUser._id, competeId: {$in: cIdArr}})

            if(scoreCount <= 0) {
                ctx.body = util.success({
                    "canInter": true
                })
            } else {
                ctx.body = util.success({
                    "canInter": false,
                    "reason": '已经参加过当前类型的竞赛'
                })
            }
        }
    }

})

module.exports = router
