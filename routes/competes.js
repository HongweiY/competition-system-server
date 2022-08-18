/**
 * 用户管理模块
 *
 */
const router = require('koa-router')()
const Compete = require('../models/competeSchema')
const Match = require('../models/matchSchema')
const util = require('../utils/util')
const Counter = require("../models/counterSchema");
router.prefix('/compete')
const dayjs = require('dayjs')
const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");
const Score = require("../models/scoreSchema");
const Pen = require("../models/penSchema");
const RoomLog = require("../models/roomLogSchema");
const FinalUser = require("../models/finalUserSchema");
const mongoose = require("mongoose");
const AnswerLog = require("../models/answerLogSchema");
const FinalPenLogSchema = require("../models/finalPenLogSchema");
const {pushFinalPen} = require("../utils/util");


// 竞赛列表
router.get('/list', async(ctx) => {
    // const { userName, userEmail, state } = ctx.request.query
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
        const list = await Compete.find(params, {}, {skip: skipIndex, limit: page.pageSize}).exec()
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
        _id,
        screenings,
        currentType = 'must',
        finalUser = 100
    } = ctx.request.body
    //判断时间
    if(dayjs(endTime).isBefore(dayjs(startTime))) {
        ctx.body = util.fail('参数异常,结束时间不得早于开始时间', util.CODE.PARAM_ERROR)
        return
    }

    let res
    if(action === 'edit') {
        // 编辑
        if(!cId) {
            ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
            return
        }
        res = await Compete.updateOne({cId}, {
            title, scores, create_uid, create_username, startTime, endTime
        })

        ctx.body = util.success({}, '操作成功')

    } else {
        // 添加
        if(!title || !scores || !create_uid || !create_username || !startTime || !endTime) {
            ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
            return
        }
        // 判断系统是否存
        const exitCompete = await Compete.findOne({$or: [{title}]}, '_id title')
        if(exitCompete) {
            ctx.body = util.fail(`添加失败。原因：竞赛名：${exitCompete.title}的竞赛已存在`)
            return
        }
        const counterDoc = await Counter.findOneAndUpdate({_id: 'competeId'}, {$inc: {sequenceValue: 1}}, {new: true})
        const result = await Compete.create({
            cId: counterDoc.sequenceValue,
            title,
            scores,
            create_uid,
            create_username,
            startTime,
            endTime,
            currentType,
            screenings,
            finalUser
        })

        if(result) {
            ctx.body = util.success({
                "cid": result.cId, "title": result.title,
            }, '添加成功')
        } else {
            ctx.body = util.fail('数据库异常')
        }
    }
})

// 删除竞赛
router.post('/delete', async(ctx) => {
    const {ids} = ctx.request.body
    // todo
    const res = await Compete.updateMany({cId: {$in: ids}}, {state: 2})
    if(res) {
        ctx.body = util.success(res, `共删除${res.matchedCount}条`)
        return
    }
    ctx.body = util.fail('删除失败')
})

/**
 * 竞赛跳转
 */
router.post('/userAdd', async(ctx) => {
    const {cid, token} = ctx.request.body
    const {username, city, depart, phone, img} = util.decrypt(token)
    // 添加人员到系统co
    if(!username || !city || !depart || !phone || !img) {
        ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        return
    }

    let userInfo = {}
    // 判断系统是否存在用户
    let exitUser = await User.findOne({$and: [{phone}, {username}]}, ['_id', 'userId', 'username', 'city', 'depart', 'phone', 'img']).exec()
    if(!exitUser) {
        //添加到系统
        const counterDoc = await Counter.findOneAndUpdate({_id: 'userId'}, {$inc: {sequenceValue: 1}}, {new: true})
        const result = await User.create({
            userId: counterDoc.sequenceValue, username, city, depart, phone, img
        })
        if(result) {
            //将用户写到redis中
            if(result._id) {
                global.redisClient.set(result._id, "ready");
            }
            //写入分数
            //const {cId, uid, rightNumber, type, useTime, answerNumber, addScore} = params
            //

            userInfo._id = result._id
            userInfo.userId = result.userId
            userInfo.username = result.username
            userInfo.city = result.city
            userInfo.depart = result.depart
            userInfo.phone = result.phone
            userInfo.img = result.img
        } else {
            ctx.body = util.fail('数据库异常')
            return
        }
    } else {
        userInfo = exitUser
    }
    //判断竞赛是否存在，存在，添加用户到竞赛
    let competeInfo = await Compete.findOne({cId: cid})
    if(!competeInfo) {
        ctx.body = util.fail(`竞赛不存在`)
        return
    }
    if(dayjs(competeInfo.startTime).isAfter(dayjs())) {
        ctx.body = util.fail(`竞赛暂未开始`)
        return
    }
    if(dayjs(competeInfo.endTime).isBefore(dayjs())) {
        ctx.body = util.fail(`竞赛已经结束`)
        return
    }

    //返回token
    const data = {}
    const userToken = jwt.sign({
        userInfo: userInfo, competeInfo: competeInfo
    }, 'ymfsder', {expiresIn: 60 * 60 * 24})
    data.token = userToken
    data.userInfo = userInfo
    data.competeInfo = competeInfo

    const scoreInfo = await Score.findOne({$and: [{competeId: cid}, {userId: userInfo._id}]}).exec()
    if(!scoreInfo) {
        await Score.create({
            competeId: cid,
            userId: userInfo._id,
            score: 0,
            scoreMust: 0,
            scoreDisuse: 0,
            scoreFinal: 0,
            answer_time: 0,
            answer_number: 0,
            accuracy_number: 0,
            accuracy: 0
        })
    }
    //创建相关房间
    ctx.body = util.success(data, '已成功进入竞赛')

})

//开始配置
router.post('/match', async(ctx) => {
    const {cid, type, uid} = ctx.request.body
    // 判断参数
    if(!cid || !type || !uid) {
        ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        return
    }
    //判断用户信息
    const userInfo = await User.findOne({userId: uid}).exec()
    if(!userInfo) {
        ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        return
    }
    const userId = userInfo._id
    //判断竞赛是否存在，存在，添加用户到竞赛
    let competeInfo = await Compete.findOne({cId: cid})
    if(!competeInfo || dayjs(competeInfo.startTime).isAfter(dayjs()) || dayjs(competeInfo.endTime).isBefore(dayjs())) {
        ctx.body = util.fail(`竞赛信息异常`)
        return
    }
    if(cid !== 1 && cid !== 2) {
        if(dayjs().unix() - dayjs(competeInfo.startTime).unix() > (20 * 60 + 20 * 60)) {
            ctx.body = util.fail(`竞赛已经结束`)
            return
        }
    }

    const roomId = await util.startMatch({cid, type, userId})

    ctx.body = util.success({roomID: roomId}, '匹配中')

})


router.post('/pushFinalPen', async(ctx) => {
    const {cid} = ctx.request.body
    await util.pushFinalPen(cid)
    ctx.body = util.success('推送定时任务')

})


//终极排位赛
router.post('/startFinal', async(ctx) => {
    const {cid, type, uid} = ctx.request.body
    // 判断参数
    if(!cid || !type || !uid) {
        ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        return
    }
    //判断竞赛是否存在，
    let competeInfo = await Compete.findOne({cId: cid})
    if(!competeInfo || dayjs(competeInfo.startTime).isAfter(dayjs())) {
        ctx.body = util.fail(`竞赛信息异常`)
        return
    }

    //判断用户信息
    const userInfo = await FinalUser.findOne({userId: uid, cid}).exec()

    if(!userInfo) {
        let myRank;
        const user = await User.findOne({userId: uid}).exec()
        let info = await Score.aggregate([
            {
                $sort: {
                    'score': -1,
                    'answer_time': 1,
                    'lastUpdateTime': 1
                }
            },
            {
                $match: {
                    'competeId': parseInt(cid)
                }
            },
            {
                "$group": {
                    "_id": null,
                    "tableA": {
                        "$push": "$$ROOT"
                    }
                }
            },
            {
                $unwind: {
                    path: '$tableA',
                    includeArrayIndex: 'arrayIndex'
                }
            },
            {
                $project: {
                    '_id': 0,
                    'userId': '$tableA.userId',
                    'score': '$tableA.score',
                    'competeId': '$tableA.competeId',
                    'arrayIndex': {
                        $add: ['$arrayIndex', 1]
                    }
                }
            },
            {
                $facet: {
                    'my': [
                        {
                            $match: {
                                "userId": new mongoose.Types.ObjectId(user._id),
                                'competeId': parseInt(cid)
                            }
                        }
                    ],
                }
            }
        ])

        myRank = info[0]['my'][0] ? info[0]['my'][0]['arrayIndex'] : 0
        ctx.body = util.success({finalRank: myRank})
        return
    }
    if(competeInfo.finalRounds === 7) {
        const finalUserInfo = await FinalUser.findOne({cid,userId:uid}).exec()
        ctx.body = util.success({rank:finalUserInfo.rank})
        return
    }

    //判断当前竞赛在哪一轮当前用户是否有资格参加
    //第一轮

    //第31-65名选手，共35名选手参加第一轮终极排位赛，
    //第11-35名选手，共25名选手参加第二轮终极排位赛
    //第1-15名选手，共15名选手参加第三轮终极排位赛
    //第66-100名选手，依次向上挑战
    //第30挑战31
    //第11
    const canGo = await util.canGoFinal(uid, cid)
    const finalPenLog = await FinalPenLogSchema.find({
        cid: cid,
        round: competeInfo['finalRounds']
    }).sort({penNumber: -1}).limit(1).exec()
    if(canGo) {
        //更新题目推送时间和倒计时。
        let countDown = 30
        countDown = countDown - (dayjs().unix() - dayjs(finalPenLog[0]['pushTime']).unix())

        const msg = {
            'event': 'pushFinalPen',
            'message': {
                rounds: 1,
                penRoundsNumber: finalPenLog[0]['penNumber'],  // 当前所在题目
                allNum: canGo.allNumber,
                area: canGo.area,
                countDown, //'剩余倒计时'
                'penId': finalPenLog[0]['penInfo'][0].penId,
                'penType': finalPenLog[0]['penInfo'][0].penType,
                'stem': finalPenLog[0]['penInfo'][0].stem,
                'options': finalPenLog[0]['penInfo'][0].options,
                'src': finalPenLog[0]['penInfo'][0].src,
                'rank': canGo.rank,
                'accuracy': canGo.accuracy
            }
        }
        // global.ws.send('', JSON.stringify(msg), uid)
        global.redisClientPub.publish('newInfo', JSON.stringify({
                roomId: '', msg: msg, uid: uid,cId: cid
            }
        ))
        ctx.body = util.success()
    } else {
        await util.pushCurrentFinalInfo(cid, competeInfo['finalRounds'], finalPenLog[0]['penNumber'])
        ctx.body = util.success({currentRank:userInfo.rank},`你不能参加当前轮次比赛`)
    }
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


    let sort;
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


    if(currentType === 'final') {
        let sort = {
            rank: 1,
        }
        //判断当前用户是不是在终极排位赛
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
                    "answer_number": finalUser.answer_number,
                    "accuracy": finalUser.accuracy_number > 0 ? (finalUser.accuracy_number * 100 / finalUser.answer_number_number).toFixed(2) + '%' : '0%',
                    "score": finalUser.score,
                    "img": finalUser.img,
                    "action": finalUser.action
                })
            }
        }

    } else {
        let sort = {
            score: -1,
            answer_time: 1,
            lastUpdateTime: 1
        }


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

router.get('/test', async(ctx) => {

    let data = JSON.stringify({
        username: 'test' + Math.random(),
        city: "武汉",
        depart: "研发部",
        phone: "13511111111",
        img: "http://xxxxx.xxx.xx.jpg"
    })
    const token = util.encrypt(data);

    const {username, city, depart, phone, img} = util.decrypt(token)
    // 判断系统是否存在用户
    let exitUser = await User.findOne({$and: [{phone}, {username}]}, ['_id', 'userId', 'username', 'city', 'depart', 'phone', 'img']).exec()
    let uid = ''
    if(!exitUser) {
        //添加到系统
        const counterDoc = await Counter.findOneAndUpdate({_id: 'userId'}, {$inc: {sequenceValue: 1}}, {new: true})
        const result = await User.create({
            userId: counterDoc.sequenceValue, username, city, depart, phone, img
        })
        uid = counterDoc.sequenceValue
    }
    const cid = 9
    const type = 'must'
    //判断用户信息
    const userInfo = await User.findOne({userId: uid}).exec()
    if(!userInfo) {
        ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        return
    }
    const userId = userInfo._id
    //判断竞赛是否存在，存在，添加用户到竞赛
    let competeInfo = await Compete.findOne({cId: cid})
    if(!competeInfo || dayjs(competeInfo.startTime).isAfter(dayjs()) || dayjs(competeInfo.endTime).isBefore(dayjs())) {
        ctx.body = util.fail(`竞赛信息异常`)
        return
    }
    if(cid !== 1 && cid !== 2) {
        if(dayjs().unix() - dayjs(competeInfo.startTime).unix() > (20 * 60 + 20 * 60)) {
            ctx.body = util.fail(`竞赛已经结束`)
            return
        }
    }

    const room_id = await util.startMatch({cid, type, userId})

    if(room_id) {
        let data = {}
        data.roomId = room_id
        ctx.body = util.success(data, '已成功进入竞赛')
    } else {
        ctx.body = util.fail(`系统错误`)
    }

})

//查询用户当前排名
router.get('/userRank', async(ctx) => {

    const {uid, cid} = ctx.request.query
    const {myRank, currentRankInfo} = await util.userRank(cid, uid)
    ctx.body = util.success({
        "status": 200,
        "msg": "success",
        myRank,
        currentRankInfo
    })
})

//获取竞赛信息
router.get('/competitionInfo', async(ctx) => {

    const {uid, cid} = ctx.request.query
    const userInfo = await User.findOne({userId: uid}).exec()
    const userId = userInfo.userId
    const competition = await Compete.findOne({cId: cid}).exec()
    let myRank = 0;
    if(competition['currentType'] === 'final') {

        const finalPenLog = await FinalPenLogSchema.find({
            cid: cid,
            round: competition['finalRounds']
        }).sort({penNumber: -1}).limit(1).exec()
        await util.pushFinalInfo(competition['finalRounds'], cid)
        if(finalPenLog.length > 0) {
            await util.pushCurrentFinalInfo(cid, competition['finalRounds'], finalPenLog[0]['penNumber'])
        }

        const inFinal = await FinalUser.findOne({cid, userId: userInfo.userId})
        if(inFinal) {
            myRank = inFinal['rank']
        } else {
            let info = await Score.aggregate([
                {
                    $sort: {
                        'score': -1,
                        'answer_time': 1,
                        'lastUpdateTime': 1
                    }
                },
                {
                    $match: {
                        'competeId': parseInt(cid)
                    }
                },
                {
                    "$group": {
                        "_id": null,
                        "tableA": {
                            "$push": "$$ROOT"
                        }
                    }
                },
                {
                    $unwind: {
                        path: '$tableA',
                        includeArrayIndex: 'arrayIndex'
                    }
                }, {
                    $project: {
                        '_id': 0,
                        'userId': '$tableA.userId',
                        'score': '$tableA.score',
                        'competeId': '$tableA.competeId',
                        'arrayIndex': {
                            $add: ['$arrayIndex', 1]
                        }
                    }
                },
                {
                    $facet: {
                        'my': [
                            {
                                $match: {
                                    "userId": new mongoose.Types.ObjectId(userId),
                                    'competeId': parseInt(cid)
                                }
                            }
                        ],
                    }
                }
            ])
            myRank = info[0]['my'][0] ? info[0]['my'][0]['arrayIndex'] : 0
        }
    }

    ctx.body = util.success({
        competition,
        myRank

    })

})

router.post('/canInter', async(ctx) => {

    const {cid, token} = ctx.request.body

    // 判断当前竞赛是不是周赛
    const competition = await Compete.findOne({cId: cid, title: {$regex: /8月第/}})
    if(!competition) {
        ctx.body = util.success({
            "canInter": true
        })
        return
    }
    // const newToken =token.replaceAll(' ', '+')
    const {username, city, depart, phone, img} = util.decrypt(token)

    // 添加人员到系统co
    if(!username || !city || !depart || !phone || !img) {
        ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        return
    }

    // 判断系统是否存在用户
    let exitUser = await User.findOne({$and: [{phone}, {username}]}, ['_id', 'userId', 'username', 'city', 'depart', 'phone', 'img']).exec()

    if(!exitUser) {
        ctx.body = util.success({
            "canInter": true
        })
    } else {
        //查询所有符合8月周赛的竞赛

        const cIds = await Compete.find({title: {$regex: /8月第/}}, {'cId': 1, _id: 0})
        if(cIds.length <= 0) {
            ctx.body = util.success({
                "canInter": true
            })
        } else {
            const cIdArr = []
            for(const cId of cIds) {
                if(cId.cId !== cid) {
                    cIdArr.push(cId.cId)
                }

            }


            const scoreList = await Score.find({userId: exitUser._id, competeId: {$in: cIdArr}})

            if(scoreList.length <= 0) {
                ctx.body = util.success({
                    "canInter": true
                })
            } else {
                ctx.body = util.success({
                    "canInter": false
                })
            }

        }


    }


})


module.exports = router
