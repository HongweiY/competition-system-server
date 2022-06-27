/**
 * 用户管理模块
 *
 */
const router = require('koa-router')()
const Score = require('../models/scoreSchema')

const util = require('../utils/util')
const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");
const Counter = require("../models/counterSchema");
const Compete = require("../models/competeSchema");
const Pen = require("../models/penSchema");
const AnswerLog = require("../models/answerLogSchema");
const RoomLog = require("../models/roomLogSchema")
const dayjs = require("dayjs");
const mongoose = require("mongoose");
const Match = require("../models/matchSchema");
const FinalUser = require("../models/finalUserSchema");
const FinalPenLogSchema = require("../models/finalPenLogSchema");

router.prefix('/score')

//定义系统变量
//必答赛
const MustTime = 20 * 60
const EachRoundPenNum = 5

const mustAddScore = [5, 3, 2, 1]

//淘汰赛
const DisuseTime = 20 * 60


//成绩列表
router.get('/list', async(ctx) => {
    const {competeId} = ctx.request.query
    const {page, skipIndex} = util.pager(ctx.request.query)
    const params = {
        competeId
    }
    try {
        const list = await Score.find(params, '', {
            skip: skipIndex, limit: page.pageSize
        }).populate('user', {username: 1}).exec()
        const total = await Score.countDocuments(params)
        ctx.body = util.success({
            page: {
                ...page, total
            }, list
        })
    } catch(e) {
        ctx.body = util.fail(`查询异常${e.stack}`)
    }
})

/**
 * 提交答案
 */
router.post('/checkAnswer', async(ctx) => {
    const {cid, answer, roomId, penId, type, useTime, rounds, score = -1} = ctx.request.body
    const {authorization} = ctx.request.headers
    const {userInfo} = jwt.decode(authorization.split(' ')[1])
    const uid = userInfo.userId
    //查询当前比赛状态
    let competeInfo = await Compete.findOne({cId: cid}).exec()
    if(!competeInfo) {
        ctx.body = util.success({'code': 500, 'msg': '竞赛信息异常'})
        return false
    }
    if(dayjs(competeInfo.endTime).isBefore(dayjs())) {
        ctx.body = util.success({'code': 500, 'msg': '竞赛信息异常'})
        return false
    }
    if(dayjs(competeInfo.startTime).isAfter(dayjs())) {
        ctx.body = util.success({'code': 500, 'msg': '竞赛信息异常'})
        return false
    }
    //判断当前竞赛模式是否正确
    if(type !== competeInfo.currentType) {
        ctx.body = util.success({'code': 500, 'msg': '竞赛信息异常'})
        return false
    }
    //重复作答
    let answerLog = 0
    if(type === 'must' || type === 'disuse') {
        answerLog = await AnswerLog.countDocuments({uid, roomId, rounds, type, cid, penId})
    } else {
        answerLog = await AnswerLog.countDocuments({
            uid,
            rounds,
            cid,
            penId,
            type: type + '-' + competeInfo['finalRounds'] + '-' + rounds
        })
    }

    if(answerLog > 0) {
        ctx.body = util.success({'code': 401, 'msg': '重复作答'})
        return false
    }
    //判断答题时候正确
    let isRight
    console.log(score)
    if(score > -1) {
        //场景题
        isRight = score === 1;
    } else {
        //普通题目
        const penInfo = await Pen.findOne({penId}).exec()
        isRight = penInfo.answer === answer;
    }
    //disuse 只能一人答题
    if(type === 'disuse') {
        const answerLog = await AnswerLog.countDocuments({roomId, rounds, type, cid, penId})
        if(answerLog > 0) {
            ctx.body = util.success({'code': 401, 'msg': '已有人作答'})
            return false
        }
    }
    if(type === 'final') {
        const canGo = util.canGoFinal(uid, cid)
        if(!canGo) {
            ctx.body = util.success({'code': 401, 'msg': '无答题资格'})
            return false
        }
    }
    if(type === 'must' || type === 'disuse') {
        //记录日志
        await AnswerLog.create({
            uid: userInfo.userId, penId, roomId, cid, postAnswer: answer,//标签
            isRight, useTime, type, rounds
        })
        //记录当前房间的答题信息
        await util.noteRoomLog({uid, roomId, rounds, cId: cid, isRight, useTime, type})
        await util.answerInfo(roomId, rounds)
    }

    //更新积分
    switch(type) {
        case 'must':
            //p判断4人是否完成
            const answerNum = await AnswerLog.countDocuments({$and: [{roomId}, {type}, {cid}, {penId}]}) * 1
            if(answerNum === 4) {
                const matchInfo = await Match.findOneAndUpdate({_id: roomId}, {currentRound: rounds + 1}).exec()
                if(rounds >= 5) {
                    if(matchInfo['state'] == 2) {
                        //计算得分，
                        const RoomLogs = await RoomLog.find({$and: [{roomId}, {type}, {cid}]}).sort({
                            rightNumber: -1, useTime: 1
                        }).exec()
                        let rank = 0
                        //修改当前聊天状态
                        await Match.findOneAndUpdate({_id: roomId}, {state: 3}).then(async() => {
                            for(const roomLog of RoomLogs) {
                                await noteScore({
                                    ...roomLog._doc, answerNumber: 5, addScore: mustAddScore[rank]
                                })
                                rank++
                            }
                            //通知客户端进行下一轮匹配
                            const msg = {
                                'event': 'matchMewRoom', 'message': {
                                    rounds: rounds + 1
                                }
                            }
                            global.ws.send(roomId.toString(), JSON.stringify(msg))
                            ctx.body = util.success({'code': 200, 'msg': '本轮答题已结束，自动匹配下一轮'})
                            return false
                        })
                    }
                } else {
                    await util.pushPen(roomId, cid, 'start')
                    ctx.body = util.success({'code': 200, 'msg': '马上加载下一题'})
                }
            }
            break;
        case 'disuse':
            const isAnswer = await AnswerLog.countDocuments({$and: [{roomId}, {type}, {cid}, {penId}]}) * 1
            if(isAnswer >= 1) {
                //计算得分
                const roomLog = await RoomLog.findOne({$and: [{roomId}, {type}, {cid}]}).exec()
                //更改状态
                await noteScore({
                    ...roomLog._doc, answerNumber: 1, addScore: isRight ? 1 : -1
                })
                //修改当前聊天状态
                await Match.findOneAndUpdate({_id: roomId}, {state: 3}).then(async(matchInfo) => {

                    const $allUsers = await User.find({_id: {$in: [matchInfo.userOneId, matchInfo.userTwoId]}})
                    for(const userInfo of $allUsers) {
                        const returnRounds = await RoomLog.countDocuments({
                            uid: userInfo.userId, cId: cid, type: competeInfo['currentType'], roomId: {$ne: roomId}
                        })
                        //通知客户端进行下一轮匹配
                        const msg = {
                            'event': 'matchMewRoom', 'message': {
                                rounds: returnRounds + 2
                            }
                        }
                        global.ws.send(roomId.toString(), JSON.stringify(msg), userInfo.userId)
                        ctx.body = util.success({'code': 200, 'msg': '本轮答题已结束，自动匹配下一轮'})
                        return false
                    }
                })
            }
            break;
        case 'final':

            // 根据轮次判断答题，
            // 第1轮 31-65中一人  66-100所有人 参加

            //第2轮 11-35中一人   66-100所有人 参加
            //第3轮  1-15 中一人   66-100所有人 参加

            //第4轮 只能一人，用户是不是挑战者，挑战者没赢，结束答题
            //第5、6轮只能一人答题
            const userInfo = await FinalUser.findOne({userId: uid, cid}).exec()
            const rank = userInfo.rank
            //重复答题
            await AnswerLog.create({
                uid: userInfo.userId, penId, cid, postAnswer: answer,//标签
                isRight, useTime,  type: type + '-' + competeInfo['finalRounds'] + '-' + rounds
            })
            switch(competeInfo['finalRounds']) {
                case 1:
                    if(rank > 65) {
                        //记录信息，同时计算正确率等信息
                        await FinalUser.updateOne({userId: uid, cid}, {
                            answer_time: userInfo.answer_time + useTime,
                            answer_number: userInfo.answer_number + 1,
                            accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                        })

                    } else {
                        //用户答对提升一名，如果答错下降一名 31名不再上升，65名不再下降
                        if(isRight) {
                            if(rank !== 31) {
                                const downUserInfo = await FinalUser.findOne({rank: rank - 1, cid})
                                await FinalUser.updateOne({userId: uid, cid}, {
                                    rank: rank - 1,
                                    answer_time: userInfo.answer_time + useTime,
                                    answer_number: userInfo.answer_number + 1,
                                    accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                                })
                                await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                            }
                        } else {
                            if(rank !== 65) {
                                const upUserInfo = await FinalUser.findOne({rank: rank + 1, cid})
                                await FinalUser.updateOne({userId: uid, cid}, {
                                    rank: rank + 1,
                                    answer_time: userInfo.answer_time + useTime,
                                    answer_number: userInfo.answer_number + 1,
                                    accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                                })
                                await FinalUser.updateOne({userId: upUserInfo.userId, cid}, {rank: rank})
                            }
                        }

                        const finalPenLog = await FinalPenLogSchema.find({
                            cid: cid, round: 1
                        }).sort({penNumber: -1}).limit(1).exec()

                        if(finalPenLog && finalPenLog[0]['penNumber'] >= 35) {
                            Compete.updateOne({cId: cid}, {finalRounds: 2}).exec().then(async() => {
                                await pushFinalPen(cid)
                            })
                            await util.pushFinalInfo(1, cid)
                        } else {
                            await pushFinalPen(cid)
                        }
                    }
                    break;
                case 2:
                    //第2轮 11-35  66-100 参加
                    if(rank > 65) {
                        //记录信息，同时计算正确率等信息
                        await FinalUser.updateOne({userId: uid, cid}, {
                            answer_time: userInfo.answer_time + useTime,
                            answer_number: userInfo.answer_number + 1,
                            accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                        })
                    } else {
                        //用户答对提升一名，如果答错下降一名 31名不再上升，65名不再下降
                        if(isRight) {
                            if(rank !== 11) {
                                const downUserInfo = await FinalUser.findOne({rank: rank - 1, cid})
                                await FinalUser.updateOne({userId: uid, cid}, {
                                    rank: rank - 1,
                                    answer_time: userInfo.answer_time + useTime,
                                    answer_number: userInfo.answer_number + 1,
                                    accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                                })

                                await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                            }
                        } else {
                            if(rank !== 35) {
                                const upUserInfo = await FinalUser.findOne({rank: rank + 1, cid})
                                await FinalUser.updateOne({userId: uid, cid}, {
                                    rank: rank + 1,
                                    answer_time: userInfo.answer_time + useTime,
                                    answer_number: userInfo.answer_number + 1,
                                    accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                                })
                                await FinalUser.updateOne({userId: upUserInfo.userId, cid}, {rank: rank})
                            }
                        }
                        const finalPenLog = await FinalPenLogSchema.find({
                            cid: cid, round: 2
                        }).sort({penNumber: -1}).limit(1).exec()

                        if(finalPenLog && finalPenLog[0]['penNumber'] >= 25) {
                            Compete.updateOne({cId: cid}, {finalRounds: 3}).exec().then(async() => {
                                await pushFinalPen(cid)
                            })
                            await util.pushFinalInfo(2, cid)
                        } else {
                            await pushFinalPen(cid)
                        }
                    }
                    break;
                case 3:
                    //第3轮 1-15 66-100 参加
                    //第2轮 11-35  66-100 参加
                    if(rank > 65) {
                        //记录信息，同时计算正确率等信息
                        await FinalUser.updateOne({userId: uid, cid}, {
                            answer_time: userInfo.answer_time + useTime,
                            answer_number: userInfo.answer_number + 1,
                            accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                        })
                    } else {
                        //用户答对提升一名，如果答错下降一名 31名不再上升，65名不再下降
                        if(isRight) {
                            if(rank !== 1) {
                                const downUserInfo = await FinalUser.findOne({rank: rank - 1, cid})
                                await FinalUser.updateOne({userId: uid, cid}, {
                                    rank: rank - 1,
                                    answer_time: userInfo.answer_time + useTime,
                                    answer_number: userInfo.answer_number + 1,
                                    accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                                })

                                await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                            }
                        } else {
                            if(rank !== 15) {
                                const upUserInfo = await FinalUser.findOne({rank: rank + 1, cid})
                                await FinalUser.updateOne({userId: uid, cid}, {
                                    rank: rank + 1,
                                    answer_time: userInfo.answer_time + useTime,
                                    answer_number: userInfo.answer_number + 1,
                                    accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                                })
                                await FinalUser.updateOne({userId: upUserInfo.userId, cid}, {rank: rank})
                            }
                        }
                        const finalPenLog = await FinalPenLogSchema.find({
                            cid: cid, round: 3
                        }).sort({penNumber: -1}).limit(1).exec()

                        if(finalPenLog && finalPenLog[0]['penNumber'] >= 15) {
                            await util.pushFinalInfo(3, cid)
                            await Compete.updateOne({cId: cid}, {finalRounds: 4}).exec()
                            //确定挑战zhe
                            const changeUser = await FinalUser.find({
                                cid,
                                rank: {$gt: 65}
                            }).sort({accuracy_number: -1}).limit(1)
                            //查询
                            await FinalUser.updateOne({rank: 66, cid}, {
                                rank: 101
                            })
                            await FinalUser.updateOne({userId: changeUser[0].userId, cid}, {
                                isChallenger: true,
                                rank: 66
                            })
                            await pushFinalPen(cid)
                        } else {
                            await pushFinalPen(cid)
                        }
                        //判断是否完成答题

                    }
                    break;
                case 4:
                    //第4轮
                    // 第一题 66 vs 60 第二题 66 vs 59 。。。。。
                    await AnswerLog.create({
                        uid: userInfo.userId, penId, cid, postAnswer: answer,//标签
                        isRight, useTime, type: type + '1-' + rounds
                    })
                    if(isRight && userInfo['isChallenger']) {
                        //挑战成功,
                        //判断是不是第一次
                        const finalPenLogCount = await FinalPenLogSchema.countDocuments({cid: cid, round: 4})
                        if(finalPenLogCount == 1) {
                            const downUserInfo = await FinalUser.findOne({rank:60, cid})

                            await FinalUser.updateOne({userId: uid, cid}, {
                                rank: 60,
                                answer_time: userInfo.answer_time + useTime,
                                answer_number: userInfo.answer_number + 1,
                                accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                            })
                            await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                        }else {
                            const downUserInfo = await FinalUser.findOne({rank: rank - 1, cid})

                            await FinalUser.updateOne({userId: uid, cid}, {
                                rank: rank - 1,
                                answer_time: userInfo.answer_time + useTime,
                                answer_number: userInfo.answer_number + 1,
                                accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                            })
                            await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                        }

                        //向下一位发送题目
                        //判断是不是到第一名
                        if(rank === 2) {
                            await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
                        }
                        await pushFinalPen(cid)
                    } else {
                        //取消当前用户挑战这生命
                        await FinalUser.updateOne({userId: uid, cid}, {isChallenger: false})
                        //更改比赛终极排位赛轮次
                        await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
                        await pushFinalPen(cid)
                        await util.pushFinalInfo(4, cid)
                    }

                    break;
                case 5:
                    //第5轮 31 vs 30
                    await AnswerLog.create({
                        uid: userInfo.userId, penId, cid, postAnswer: answer,//标签
                        isRight, useTime, type: type + '1-' + rounds
                    })
                    if(isRight && rank === 31) {
                        const downUserInfo = await FinalUser.findOne({rank: rank - 1})
                        await FinalUser.updateOne({userId: uid, cid}, {
                            rank: rank - 1,
                            answer_time: userInfo.answer_time + useTime,
                            answer_number: userInfo.answer_number + 1,
                            accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                        })
                        await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                    }
                    await Compete.updateOne({cId: cid}, {finalRounds: 6}).exec()
                    await pushFinalPen(cid)
                    await util.pushFinalInfo(5, cid)
                    break;
                case 6:
                    await AnswerLog.create({
                        uid: userInfo.userId, penId, cid, postAnswer: answer,//标签
                        isRight, useTime, type: type + '1-' + rounds
                    })
                    if(isRight && rank === 11) {
                        //挑战成功，进入下一轮
                        const downUserInfo = await FinalUser.findOne({rank: rank - 1})
                        await FinalUser.updateOne({userId: uid, cid}, {
                            rank: rank - 1,
                            answer_time: userInfo.answer_time + useTime,
                            answer_number: userInfo.answer_number + 1,
                            accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
                        })
                        await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                    }
                    await Compete.updateOne({cId: cid}, {finalRounds: 7}).exec()
                    await pushFinalPen(cid)
                    await util.pushFinalInfo(5, cid)
            }


            break;
    }
    if(isRight) {
        ctx.body = util.success({code: 200, msg: "回答正确"}, '回答完成')
    } else {
        ctx.body = util.success({code: 401, msg: "回答错误"}, '回答完成')
    }

})

/**
 * 时间到了，提交答案
 */
router.post('/timeOutAnswer', async(ctx) => {
    const {cid, roomId, type, useTime, rounds} = ctx.request.body
    const {authorization} = ctx.request.headers
    const {userInfo} = jwt.decode(authorization.split(' ')[1])
    const uid = userInfo.userId
    //查询当前比赛状态
    let competeInfo = await Compete.findOne({cId: cid}).exec()
    if(!competeInfo) {
        return false
    }
    if(dayjs(competeInfo.endTime).isBefore(dayjs())) {
        return false
    }
    if(dayjs(competeInfo.startTime).isAfter(dayjs())) {
        return false
    }
    //判断当前竞赛模式是否正确
    if(type !== competeInfo.currentType) {
        return false
    }
    //记录当前房间的答题信息
    if(type !== 'final') {
        const MatchInfo = await Match.findOne({_id: roomId, state: 2}).exec()
        if(!MatchInfo) {
            return false;
        }
        await util.noteRoomLog({uid, roomId, rounds, cId: cid, isRight: false, useTime, type})
    }

    switch(type) {
        case 'must':
            //必答赛是不是最后一题
            await Match.updateOne({_id: roomId}, {currentRound: rounds + 1}).exec()
            if(rounds >= 5) {
                if(MatchInfo['state'] == 2) {
                    //计算得分，
                    const RoomLogs = await RoomLog.find({$and: [{roomId}, {type}, {cid}]}).sort({
                        rightNumber: -1, useTime: 1
                    }).exec()
                    let rank = 0
                    //修改当前聊天状态
                    await Match.findOneAndUpdate({_id: roomId}, {state: 3}).then(async() => {
                        for(const roomLog of RoomLogs) {
                            await noteScore({
                                ...roomLog._doc, answerNumber: 5, addScore: mustAddScore[rank]
                            })
                            rank++
                        }
                        //通知客户端进行下一轮匹配
                        const msg = {
                            'event': 'matchMewRoom', 'message': {
                                rounds: rounds + 1
                            }
                        }
                        global.ws.send(roomId.toString(), JSON.stringify(msg))
                        ctx.body = util.success({'code': 200, 'msg': '本轮答题已结束，自动匹配下一轮'})
                        return false
                    })
                }
            } else {
                //分发题目
                await util.pushPen(roomId, cid, 'start')
                ctx.body = util.success({'code': 200, 'msg': '马上加载下一题'})
                return false
            }
            break;

        case 'disuse':
            await Match.findOneAndUpdate({_id: roomId}, {state: 3})
            const msg = {
                'event': 'matchMewRoom', 'message': {
                    rounds: rounds + 1
                }
            }
            global.ws.send(roomId.toString(), JSON.stringify(msg))
            ctx.body = util.success({'code': 200, 'msg': '本轮答题已结束，自动匹配下一轮'})
            return;
            break;
        case 'final':
            const can = await util.canGoFinal(uid, cid)
            if(can) {
                const userInfo = await FinalUser.findOne({userId: uid, cid}).exec()
                const rank = userInfo.rank
                switch(competeInfo['finalRounds']) {
                    case 1:
                        const finalPenLog_1 = await FinalPenLogSchema.find({
                            cid: cid, round: 1
                        }).sort({penNumber: -1}).limit(1).exec()
                        if(finalPenLog_1 && finalPenLog_1[0]['penNumber'] >= 35) {
                            Compete.updateOne({cId: cid}, {finalRounds: 2}).exec().then(async() => {
                                await pushFinalPen(cid)
                            })
                        } else {
                            await pushFinalPen(cid)
                        }
                        break;
                    case 2:
                        const finalPenLog_2 = await FinalPenLogSchema.find({
                            cid: cid, round: 2
                        }).sort({penNumber: -1}).limit(1).exec()
                        if(finalPenLog_2 && finalPenLog_2[0]['penNumber'] >= 35) {
                            Compete.updateOne({cId: cid}, {finalRounds: 2}).exec().then(async() => {
                                await pushFinalPen(cid)
                            })
                        } else {
                            await pushFinalPen(cid)
                        }
                        break;
                    case 3:
                        //第3轮 1-15 66-100 参加
                        //第2轮 11-35  66-100 参加
                        const finalPenLog_3 = await FinalPenLogSchema.find({
                            cid: cid, round: 3
                        }).sort({penNumber: -1}).limit(1).exec()
                        if(finalPenLog_3 && finalPenLog_3[0]['penNumber'] >= 35) {
                            Compete.updateOne({cId: cid}, {finalRounds: 2}).exec().then(async() => {
                                await pushFinalPen(cid)
                            })
                        } else {
                            await pushFinalPen(cid)
                        }
                        break;
                        break;
                    case 4:
                        //第4轮
                        //取消当前用户挑战这生命
                        await FinalUser.updateOne({userId: uid, cid}, {isChallenger: false})
                        //更改比赛终极排位赛轮次
                        await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
                        await pushFinalPen(cid)
                        break;
                    case 5:
                        //第5轮 31 vs 30
                        await Compete.updateOne({cId: cid}, {finalRounds: 6}).exec()
                        await pushFinalPen(cid)
                        break;
                    case 6:
                        await Compete.updateOne({cId: cid}, {finalRounds: 7}).exec()
                        await pushFinalPen(cid)
                        break;
                }
            } else {
                return false
            }

            break;
    }
    ctx.body = util.success('', '时间推送完成')
})


async function noteScore(params) {
    const {cId, uid, rightNumber, type, useTime, answerNumber, addScore} = params
    const userInfo = await User.findOne({userId: uid}).exec()
    //查询是否有记录
    const scoreInfo = await Score.findOne({$and: [{competeId: cId}, {userId: userInfo._id}]}).exec()
    if(scoreInfo) {
        //添加
        let {scoreMust, scoreDisuse, scoreFinal} = scoreInfo
        switch(type) {
            case 'must':
                scoreMust += addScore
                break;
            case 'disuse':
                scoreDisuse += addScore
                break;
            case 'final':
                scoreFinal += addScore
                break;
        }
        //更新
        await Score.updateOne({_id: scoreInfo._id}, {
            score: scoreInfo.score + parseInt(addScore),
            scoreMust,
            scoreDisuse,
            scoreFinal,
            answer_time: scoreInfo.answer_time + useTime,
            answer_number: scoreInfo.answer_number + answerNumber,
            accuracy_number: scoreInfo.accuracy_number + rightNumber,
            accuracy: ((scoreInfo.accuracy_number + rightNumber) / (scoreInfo.answer_number + answerNumber)).toFixed(4)
        })
    } else {
        //添加
        let scoreMust = 0, scoreDisuse = 0, scoreFinal = 0
        switch(type) {
            case 'must':
                scoreMust = addScore
                break;
            case 'disuse':
                scoreDisuse = addScore
                break;
            case 'final':
                scoreFinal = addScore
                break;
        }
        await Score.create({
            competeId: cId,
            userId: userInfo._id,
            score: addScore,
            scoreMust,
            scoreDisuse,
            scoreFinal,
            answer_time: useTime,
            answer_number: answerNumber,
            accuracy_number: rightNumber,
            accuracy: (rightNumber / answerNumber).toFixed(4)
        })
    }


}

//推送终极排位赛题目
async function pushFinalPen(cid) {
    let competeInfo = await Compete.findOne({cId: cid})
    const finaUsers = await FinalUser.find()
    //生成题目，写入数据库

    const penInfo = await Pen.aggregate().sample(1)
    const finalRounds = competeInfo['finalRounds']

    const finalPenLog = await FinalPenLogSchema.find({
        cid: cid, round: finalRounds
    }).sort({penNumber: -1}).limit(1).exec()

    let penRoundsNumber = 1
    if(finalPenLog[0]) {
        penRoundsNumber = finalPenLog[0]['penNumber'] + 1
    }

    //将新数据写入数据
    await FinalPenLogSchema.create({
        cid: cid,//竞赛id
        round: finalRounds,//轮数
        penId: penInfo.penId,
        penInfo: penInfo,//题目
        penNumber: penRoundsNumber,//第几题
    })
    //更新题目推送时间和倒计时。
    let countDown = 30
    for(const finaUser of finaUsers) {
        const canGo = await util.canGoFinal(finaUser.userId, cid)
        if(canGo) {

            console.log(canGo.allNumber,
                canGo.area,
                canGo.rank)
            const msg = {
                'event': 'pushFinalPen',
                'message': {
                    rounds: finalRounds,
                    penRoundsNumber: penRoundsNumber,  // 当前所在题目
                    allNum: canGo.allNumber,
                    area: canGo.area,
                    rank: canGo.rank,
                    accuracy: canGo.accuracy === 'NaN%' ? '100%' : canGo.accuracy,
                    countDown, //'剩余倒计时'
                    'penId': penInfo[0].penId,
                    'penType': penInfo[0].penType,
                    'stem': penInfo[0].stem,
                    'options': penInfo[0].options,
                    'src': penInfo[0].src,

                }
            }
            global.ws.send('', JSON.stringify(msg), finaUser.userId)
        }
    }
}


module.exports = router
