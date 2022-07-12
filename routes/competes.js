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
const {pushCurrentFinalInfo} = require("../utils/util");


// 竞赛列表
router.get('/list', async(ctx) => {
    // const { userName, userEmail, state } = ctx.request.query
    const {page, skipIndex,} = util.pager(ctx.request.query)
    const {keyword} = ctx.request.query
    const params = {
        state: 1
    }
    if(keyword){
        params.title = {
            $regex: keyword, $options: 'i'
        }
    }
    console.log(params)
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
        finalUser=100
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
    console.log({username, city, depart, phone, img})
    // 添加人员到系统
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

    const room_id = await util.startMatch({cid, type, userId})

    if(room_id) {
        let data = {}
        data.roomId = room_id
        ctx.body = util.success(data, '已成功进入竞赛')
    } else {
        ctx.body = util.fail(`系统错误`)

    }

})
//终极排位赛
router.post('/startFinal', async(ctx) => {
    const {cid, type, uid} = ctx.request.body
    // 判断参数
    if(!cid || !type || !uid) {
        ctx.body = util.fail('参数异常', util.CODE.PARAM_ERROR)
        return
    }
    //判断用户信息
    const userInfo = await FinalUser.findOne({userId: uid, cid}).exec()
    if(!userInfo) {
        ctx.body = util.fail('你不能参加终极排位赛', util.CODE.PARAM_ERROR)
        return
    }
    //判断竞赛是否存在，
    let competeInfo = await Compete.findOne({cId: cid})
    if(!competeInfo || dayjs(competeInfo.startTime).isAfter(dayjs()) || dayjs(competeInfo.endTime).isBefore(dayjs())) {
        ctx.body = util.fail(`竞赛信息异常`)
        return
    }
    if(competeInfo.finalRounds===7) {
        await util.pushFinalInfo(6, cid)
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
    const finalPenLog = await FinalPenLogSchema.find({cid: cid ,round:competeInfo['finalRounds']}).sort({penNumber: -1}).limit(1).exec()
    if(canGo) {
        //只写一次信息

        //推送题目

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
        global.ws.send('', JSON.stringify(msg), uid)
        ctx.body = util.success('推送题目')
    } else {
        await util.pushCurrentFinalInfo(cid, competeInfo['finalRounds'],finalPenLog[0]['penNumber'])
        ctx.body = util.fail(`你不能参加当前轮次比赛`)
        return
    }
})

//观摩
router.get('/show', async(ctx) => {

    // let mId = 1001
    // // let userParams = {userId: {$in: [10000039, 10000040, 10000041, 10000042]}}
    // let userParams = {userId:{$in: [10000027,10000033,10000034,10000035]}}
    // for(let i = 0; i < 2000; i++) {
    //     const userInfo = await User.aggregate().match(userParams).sample(1)
    //     await Match.create({
    //         mId,
    //         cid: 2,
    //         type: "disuse",
    //         userCount: 1,
    //         userOneId: userInfo[0]._id,
    //         state: 1,
    //         currentRound: 1
    //     })
    //     mId++
    // }
    //
    //
    // let nmId = 3001
    // for(let i = 0; i < 2000; i++) {
    //     const userInfo = await User.aggregate().match(userParams).sample(3)
    //     await Match.create({
    //         mId: nmId,
    //         cid: 2,
    //         type: "must",
    //         userCount: 3,
    //         userOneId: userInfo[0]._id,
    //         userTwoId: userInfo[1]._id,
    //         userThreeId: userInfo[2]._id,
    //         state: 1,
    //         currentRound: 1
    //     })
    //     nmId++
    // }


    // db.getCollection("match").insert({
    //     _id: ObjectId("62bd554a60d3d3cb0128b45f"),
    //     mId: NumberInt("101002"),
    //     cid: NumberInt("2"),
    //     type: "disuse",
    //     userCount: NumberInt("1"),
    //     userOneId: ObjectId("62b5774c6813c9477ffea481"),
    //     createTime: ISODate("2022-06-30T07:47:00.187Z"),
    //     state: NumberInt("1"),
    //     pushPen: [],
    //     currentRound: NumberInt("1"),
    //     __v: NumberInt("0")
    // });
    // let UserInfo = await User.find().exec()
    // //写入测试数据
    // let scoreId = 100001
    // for(const userInfoElement of UserInfo) {
    //     await Score.create({
    //         scoreId,
    //         competeId: 3,
    //         userId: userInfoElement._id,
    //         score: parseInt(Math.random() * 100),
    //         scoreMust: 0,
    //         scoreDisuse: 0,
    //         scoreFinal: 0,
    //         answer_time: 0,
    //         answer_number: 0,
    //         accuracy_number: 0,
    //         accuracy: 0
    //     })
    //     scoreId++
    // }


    const {order = 'score', orderCondition = 'desc', page = 1, page_size = 20} = ctx.request.query

    const uid = ctx.request.query.uid
    const cid = ctx.request.query.cid
    let info = await Score.aggregate([
        {
            $sort: {
                'score': -1
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
                            "userId": new mongoose.Types.ObjectId(uid),
                            'competeId': parseInt(cid)
                        }
                    }
                ],
            }
        }
    ])

    const skipIndex = (page - 1) * page_size
    let sort = {
        score: -1
    }

    if(orderCondition === 'asc') {
        sort = {
            score: 1
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


    const params = {
        competeId: cid
    }

    try {
        const list = await Score.find(params, {}, {
            skip: skipIndex, limit: page_size, sort: sort
        }).populate(['userId']).exec()
        let returnData = []
        if(list) {
            for(let i = 0; i < list.length; i++) {
                let score = list[i]
                let username = score.userId.username
                if(username.length < 3) {
                    username = username.substring(0, 1) + '*'
                } else {
                    let mid = ''
                    for(let j = 0; j < username.length - 2; j++) {
                        mid = mid === '' ? '*' : mid + '*'
                    }
                    username = username.substring(0, 1) + mid + username.substring(username.length - 2, username.length - 1)
                }
                returnData.push({
                    "username": username,
                    "phone": score.userId.phone.substring(0, 3) + 'xxxx' + score.userId.phone.substring(7, 11),
                    "rank": (page - 1) * page_size + i + 1,
                    "answer_time": score.answer_time,
                    "answer_number": score.answer_number,
                    "accuracy": (score.accuracy * 100).toFixed(2) + '%',
                    "score": score.score,
                    "img": score.userId.img
                })
            }


        }

        const total = await Score.countDocuments(params)
        const competitionInfo = await Compete.findOne({cId: cid}).exec()
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
            currentRank: info[0]['my'][0] ? info[0]['my'][0]['arrayIndex'] : 0,
            currentRankInfo: info[0]['my'][0] ? info[0]['my'][0] : [],
            data: returnData
        })
    } catch(e) {
        ctx.body = util.fail(`查询异常${e.stack}`)
    }
})
//查询用户当前排名
router.get('/userRank', async(ctx) => {

    const {uid, cid} = ctx.request.query
    let info = await Score.aggregate([
        {
            $sort: {
                'score': -1
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
                            "userId": new mongoose.Types.ObjectId(uid),
                            'competeId': parseInt(cid)
                        }
                    }
                ],
            }
        }
    ])
    ctx.body = util.success({
        "status": 200,
        "msg": "success",
        myRank: info[0]['my'][0] ? info[0]['my'][0]['arrayIndex'] : 0
    })
})

//获取竞赛信息
router.get('/competitionInfo', async(ctx) => {
    const cid = ctx.request.query.cid
    const competition = await Compete.findOne({cId: cid}).exec()
    ctx.body = util.success({
        competition
    })

})


module.exports = router
