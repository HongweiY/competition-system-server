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
const Division = require("../models/divisionSchema");
const FinalPenLogSchema = require("../models/finalPenLogSchema");
const {pushFinalPen} = require("../utils/util");
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
        const {competeId, username, depart} = ctx.request.query
        const {page, skipIndex} = util.pager(ctx.request.query)
        const params = {
            competeId: parseInt(competeId)
        }

        let users
        if(username) {
            if(depart) {
                console.log(111)
                users = await User.find({
                    $and: [
                        {username: {$regex: username, $options: 'i'}},
                        {depart: {$regex: depart, $options: 'i'}}
                    ]


                })
            } else {

                users = await User.find({username: {$regex: username, $options: 'i'}})
            }


        } else {
            if(depart) {
                users = await User.find(
                    {depart: {$regex: depart, $options: 'i'}}
                )
            }
        }
        let userIds = []
        if(users) {
            for(const user of users) {
                userIds.push(user._id)
            }

        }
        // if(userIds) {
        //     params.userId = {
        //         $in: userIds
        //     }
        // }

        try {

            const list = await Score.find(params, '', {
                skip: skipIndex, limit: page.pageSize
            }).populate({path: 'userId'}).sort({score: -1,answer_time:1,lastUpdateTime:1}).exec()
            const total = await Score.countDocuments(params)
            ctx.body = util.success({
                page: {
                    ...page, total
                }, list
            })
        } catch(e) {
            ctx.body = util.fail(`查询异常${e.stack}`)
        }
    }
)

router.get('/divisionList', async(ctx) => {
    try {
        const list = await Division.find({}, {}).sort({id: -1}).exec()
        ctx.body = util.success({
          list
        })
    } catch(e) {
        ctx.body = util.fail(`查询异常${e.stack}`)
    }
})


router.get('/exportScore', async(ctx) => {
    const {competeId, keyword} = ctx.request.query
    if(!competeId) {
        ctx.body = util.fail('请选择需要导出成绩的竞赛')
    }
    const params = {
        competeId: parseInt(competeId)
    }
    //根据比赛模式导出对应的成绩
    const competitionInfo = await Compete.findOne({cId: competeId})
    if(competitionInfo.screenings === 2) {
        //根据分数表导出成绩
        try {
            const list = await Score.find(params, {_id: 0, competeId: 0, createTime: 0, __v: 0}, {
                limit: 100
            }).populate('userId', 'username-_id,city,depart,phone', '', {
                depart: {
                    $regex: keyword,
                    $options: 'i'
                }
            }).sort({score: -1}).exec()

            ctx.body = util.success({
                list, competitionInfo
            })
        } catch(e) {
            ctx.body = util.fail(`查询异常${e.stack}`)
        }
    } else {
        //根据终极排位赛导出前100名
        try {
            const list = await FinalUser.find(params, {
                _id: 0, userId: 0, img: 0, cid: 0, createTime: 0, __v: 0, isChallenger: 0
            }).sort({rank: 1}).exec()
            ctx.body = util.success({
                list, competitionInfo
            })
        } catch(e) {
            ctx.body = util.fail(`查询异常${e.stack}`)
        }
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
            uid: userInfo.userId, cid, penId, type: type + '-' + competeInfo['finalRounds'] + '-' + rounds
        })
    }

    if(answerLog > 0) {
        ctx.body = util.success({'code': 401, 'msg': '重复作答'})
        return false
    }
    //判断答题时候正确
    let isRight
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
        const canGo = await util.canGoFinal(uid, cid)
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

    if(type === 'disuse') {
        //记录另一个人信息
        const disuseMatchInfo = await Match.findById(roomId).exec();
        const otherUserId = disuseMatchInfo['userOneId'] === userInfo._id ? disuseMatchInfo['userTwoId'] : disuseMatchInfo['userOneId']
        const otherUserInfo = await User.findById(otherUserId).exec()
        const returnRounds = await RoomLog.countDocuments({
            uid: otherUserInfo.userId, cId: cid, type, roomId: {$ne: roomId}
        })
        await AnswerLog.create({
            uid: otherUserInfo.userId, penId, roomId, cid, postAnswer: answer,//标签
            isRight: 0, useTime, type, rounds: returnRounds
        })
        //记录当前房间的答题信息
        await util.noteRoomLog({
            uid: otherUserInfo.userId,
            roomId,
            rounds: returnRounds,
            cId: cid,
            isRight: 0,
            useTime,
            type
        })
    }
    //更新积分
    switch(type) {
        case 'must':
            //p判断4人是否完成
            const answerNum = await AnswerLog.countDocuments({$and: [{roomId}, {type}, {cid}, {penId}]}) * 1
            if(answerNum >= 4) {
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
                                //通知客户端进行下一轮匹配
                                const msg = {
                                    'event': 'matchMewRoom', 'message': {
                                        rounds: Math.random()
                                    }
                                }
                                //global.ws.send(roomId.toString(), JSON.stringify(msg), roomLog.uid)
                                global.redisClientPub.publish('newInfo', JSON.stringify({
                                    roomId: roomId.toString(), msg: msg, uid: roomLog.uid, cId: cid
                                }))
                            }
                            await util.setRoomUserStatus(roomId)
                            ctx.body = util.success({'code': 200, 'msg': '本轮答题已结束，自动匹配下一轮'})
                        })
                        return false
                    }
                } else {
                    util.assignPen(roomId, cid).then(async() => {
                        await util.pushPen(roomId, cid, 'start')
                    })

                    ctx.body = util.success({'code': 200, 'msg': '马上加载下一题'})
                }
            }
            break;
        case 'disuse':
            //计算得分
            console.log('提交答案验证2')
            const roomLog = await RoomLog.findOne({$and: [{roomId}, {type}, {cid}]}).exec()
            //更改状态
            await noteScore({
                ...roomLog._doc, answerNumber: 1, addScore: isRight ? 1 : -1
            })
            //修改当前聊天状态
            await Match.findOneAndUpdate({_id: roomId}, {state: 3}).then(async(matchInfo) => {
                const $allUsers = await User.find({_id: {$in: [matchInfo.userOneId, matchInfo.userTwoId]}})
                for(const userInfo of $allUsers) {
                    //通知客户端进行下一轮匹配
                    const msg = {
                        'event': 'matchMewRoom', 'message': {
                            rounds: Math.random()
                        }
                    }
                    //global.ws.send('', JSON.stringify(msg), userInfo.userId)
                    global.redisClientPub.publish('newInfo', JSON.stringify({
                        roomId: '', msg: msg, uid: userInfo.userId, cId: cid
                    }))
                    ctx.body = util.success({'code': 200, 'msg': '本轮答题已结束，自动匹配下一轮'})

                }
                await util.setRoomUserStatus(roomId)
                return false
            })

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
                isRight, useTime, type: type + '-' + competeInfo['finalRounds'] + '-' + rounds
            })
            const penInfo = await Pen.findOne({penId})
            //记录信息，同时计算正确率等信息
            await FinalUser.updateOne({userId: uid, cid}, {
                answer_time: userInfo.answer_time + useTime,
                answer_number: userInfo.answer_number + 1,
                accuracy_number: userInfo.accuracy_number + (isRight ? 1 : 0),
            })
            //判断终极排位赛人数
            const finalUser = competeInfo['finalUser']
            let spacingCount = 5
            if(finalUser === 60) {
                spacingCount = 4
            }
            switch(competeInfo['finalRounds']) {
                case 1:
                    if(rank <= finalUser * 0.6 + spacingCount) {
                        //用户答对提升一名，如果答错下降一名 31名不再上升，65名不再下降
                        if(isRight) {
                            if(rank !== finalUser * 0.3 + 1) {
                                const downUserInfo = await FinalUser.findOne({rank: rank - 1, cid})
                                if(downUserInfo) {
                                    await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                                    await util.setUserAction(cid, downUserInfo.userId, uid)
                                }
                                await FinalUser.updateOne({userId: uid, cid}, {rank: rank - 1})

                            }
                        } else {
                            if(rank !== finalUser * 0.6 + spacingCount) {
                                const upUserInfo = await FinalUser.findOne({rank: rank + 1, cid})
                                await FinalUser.updateOne({userId: uid, cid}, {rank: rank + 1})
                                if(upUserInfo) {
                                    await FinalUser.updateOne({userId: upUserInfo.userId, cid}, {rank: rank})
                                    await util.setUserAction(cid, uid, upUserInfo.userId)
                                }
                            }
                        }
                        const finalPenLog = await FinalPenLogSchema.find({
                            cid: cid, round: 1
                        }).sort({penNumber: -1}).limit(1).exec()
                        if(finalPenLog && finalPenLog[0]['penNumber'] >= finalUser * 0.3 + spacingCount) {
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
                    if(rank <= finalUser * 0.3 + spacingCount) {
                        //用户答对提升一名，如果答错下降一名 31名不再上升，65名不再下降
                        if(isRight) {
                            if(rank !== finalUser * 0.1 + 1) {
                                const downUserInfo = await FinalUser.findOne({rank: rank - 1, cid})
                                await FinalUser.updateOne({userId: uid, cid}, {rank: rank - 1})
                                if(downUserInfo) {
                                    await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                                    await util.setUserAction(cid, downUserInfo.userId, uid)
                                }

                            }
                        } else {
                            if(rank !== finalUser * 0.3 + spacingCount) {
                                const upUserInfo = await FinalUser.findOne({rank: rank + 1, cid})
                                if(upUserInfo) {
                                    await FinalUser.updateOne({userId: upUserInfo.userId, cid}, {rank: rank})
                                    await util.setUserAction(cid, uid, upUserInfo.userId)
                                }
                                await FinalUser.updateOne({userId: uid, cid}, {rank: rank + 1})

                            }
                        }
                        const finalPenLog = await FinalPenLogSchema.find({
                            cid: cid, round: 2
                        }).sort({penNumber: -1}).limit(1).exec()

                        if(finalPenLog && finalPenLog[0]['penNumber'] >= finalUser * 0.2 + spacingCount) {
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
                    if(rank <= finalUser * 0.1 + spacingCount) {
                        //用户答对提升一名，如果答错下降一名 31名不再上升，65名不再下降
                        if(isRight) {
                            if(rank !== 1) {
                                const downUserInfo = await FinalUser.findOne({rank: rank - 1, cid})
                                if(downUserInfo) {
                                    await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                                    await util.setUserAction(cid, downUserInfo.userId, uid)
                                }
                                await FinalUser.updateOne({userId: uid, cid}, {rank: rank - 1})

                            }
                        } else {
                            if(rank !== finalUser * 0.1 + spacingCount) {
                                const upUserInfo = await FinalUser.findOne({rank: rank + 1, cid})
                                await FinalUser.updateOne({userId: uid, cid}, {rank: rank + 1})
                                if(upUserInfo) {
                                    await FinalUser.updateOne({userId: upUserInfo.userId, cid}, {rank: rank})
                                    await util.setUserAction(cid, uid, upUserInfo.userId)
                                }

                            }
                        }
                        const finalPenLog = await FinalPenLogSchema.find({
                            cid: cid, round: 3
                        }).sort({penNumber: -1}).limit(1).exec()

                        if(finalPenLog && finalPenLog[0]['penNumber'] >= finalUser * 0.1 + spacingCount) {
                            await util.pushFinalInfo(3, cid)
                            // await FinalUser.updateOne({rank: finalUser * 0.6 + spacingCount + 1, cid}, {
                            //     rank: finalUser + 1
                            // })
                            await Compete.updateOne({cId: cid}, {finalRounds: 4}).exec()
                            //确定挑战zhe
                            const changeUser = await FinalUser.find({
                                cid, rank: {$gt: finalUser * 0.6 + spacingCount}
                            }).sort({accuracy_number: -1}).limit(1)
                            //查询
                            await FinalUser.updateOne({userId: changeUser[0].userId, cid}, {
                                isChallenger: true, rank: finalUser * 0.6 + spacingCount + 1
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
                    //场景题需要两人提交，比较分数
                    if(penInfo.penType === '场景题') {
                        // 需要等待两人答题完毕
                        const answerLogs = await AnswerLog.find({
                            penId, cid, type: type + '-' + competeInfo['finalRounds'] + '-' + rounds
                        })
                        //回答完毕，判断得分
                        if(answerLogs.length >= 2) {
                            //查询挑战者
                            const challengerUser = await FinalUser.findOne({cid: cid, isChallenger: true})
                            let challengerScore = 0;
                            let challengerTime = 0;
                            let otherScore = 0;
                            let otherTime = 0;
                            for(const answerLog of answerLogs) {
                                if(answerLog.uid === challengerUser.userId) {
                                    challengerScore = parseInt(answerLog.postAnswer)
                                    challengerTime = parseInt(answerLog.useTime)
                                } else {
                                    otherScore = parseInt(answerLog.postAnswer)
                                    otherTime = parseInt(answerLog.useTime)
                                }
                            }
                            //挑战成功
                            if(challengerScore > otherScore) {
                                //判断是不是第一次
                                const finalPenLogCount = await FinalPenLogSchema.countDocuments({
                                    cid: cid,
                                    round: 4
                                })
                                if(finalPenLogCount === 1) {
                                    const downUserInfo = await FinalUser.findOne({rank: finalUser * 0.6, cid})
                                    await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                                    await FinalUser.updateOne({
                                        userId: challengerUser.userId, cid
                                    }, {rank: finalUser * 0.6})
                                    await util.setUserAction(cid, downUserInfo.userId, challengerUser.userId)
                                } else {
                                    const downUserInfo = await FinalUser.findOne({
                                        rank: challengerUser.rank - 1,
                                        cid
                                    })
                                    await FinalUser.updateOne({
                                        userId: downUserInfo.userId, cid
                                    }, {rank: challengerUser.rank})
                                    await FinalUser.updateOne({
                                        userId: challengerUser.userId, cid
                                    }, {rank: downUserInfo.rank})
                                    await util.setUserAction(cid, downUserInfo.userId, challengerUser.userId)
                                }
                                //向下一位发送题目
                                //判断是不是到第一名
                                if(rank === 2) {
                                    await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
                                }
                                await pushFinalPen(cid)
                                if(challengerUser.userId === uid) {
                                    ctx.body = util.success({code: 200, msg: "挑战成功"}, '挑战成功')
                                } else {
                                    ctx.body = util.success({code: 200, msg: "很遗憾，对手挑战成功"}, '守位失败')
                                }

                            } else if(challengerScore === otherScore) {//分数相等，判断时间
                                if(challengerTime < otherTime) {
                                    const finalPenLogCount = await FinalPenLogSchema.countDocuments({
                                        cid: cid, round: 4
                                    })
                                    if(finalPenLogCount === 1) {
                                        const downUserInfo = await FinalUser.findOne({
                                            rank: finalUser * 0.6,
                                            cid
                                        })
                                        await FinalUser.updateOne({
                                            userId: downUserInfo.userId,
                                            cid
                                        }, {rank: rank})
                                        await FinalUser.updateOne({
                                            userId: challengerUser.userId, cid
                                        }, {rank: finalUser * 0.6})

                                        await util.setUserAction(cid, downUserInfo.userId, challengerUser.userId)
                                    } else {
                                        const downUserInfo = await FinalUser.findOne({
                                            rank: challengerUser.rank - 1, cid
                                        })
                                        await FinalUser.updateOne({
                                            userId: downUserInfo.userId, cid
                                        }, {rank: challengerUser.rank})
                                        await FinalUser.updateOne({
                                            userId: challengerUser.userId, cid
                                        }, {rank: downUserInfo.rank})

                                        await util.setUserAction(cid, downUserInfo.userId, challengerUser.userId)
                                    }
                                    //向下一位发送题目
                                    //判断是不是到第一名
                                    if(rank === 2) {
                                        await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
                                    }
                                    await pushFinalPen(cid)
                                    if(challengerUser.userId === uid) {
                                        ctx.body = util.success({code: 200, msg: "挑战成功"}, '挑战成功')
                                    } else {
                                        ctx.body = util.success({
                                            code: 200,
                                            msg: "很遗憾，对手挑战成功"
                                        }, '守位失败')
                                    }
                                } else {
                                    //挑战失败
                                    //取消当前用户挑战这生命
                                    await FinalUser.updateOne({userId: uid, cid}, {isChallenger: false})
                                    //更改比赛终极排位赛轮次
                                    await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
                                    await pushFinalPen(cid)
                                    await util.pushFinalInfo(4, cid)
                                    if(challengerUser.userId === uid) {
                                        ctx.body = util.success({code: 200, msg: "很遗憾,挑战失败"}, '挑战失败')
                                    } else {
                                        ctx.body = util.success({code: 200, msg: "恭喜，守位成功"}, '守位成功')
                                    }
                                }

                            } else {
                                //挑战失败
                                //取消当前用户挑战这生命
                                await FinalUser.updateOne({userId: uid, cid}, {isChallenger: false})
                                //更改比赛终极排位赛轮次
                                await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
                                await pushFinalPen(cid)
                                await util.pushFinalInfo(4, cid)
                                if(challengerUser.userId === uid) {
                                    ctx.body = util.success({code: 200, msg: "很遗憾,挑战失败"}, '挑战失败')
                                } else {
                                    ctx.body = util.success({code: 200, msg: "恭喜，守位成功"}, '守位成功')
                                }
                            }
                        } else {
                            ctx.body = util.success({code: 200, msg: "回答完成，等待另一个选手回答"}, '回答完成')
                            return false
                        }
                    } else {
                        // 第一题 66 vs 60 第二题 66 vs 59 。。。。。
                        const challengerUser = await FinalUser.findOne({isChallenger: true, cid: cid})
                        if(isRight && userInfo['isChallenger']) {
                            //挑战成功,
                            //判断是不是第一次
                            const finalPenLogCount = await FinalPenLogSchema.countDocuments({
                                cid: cid,
                                round: 4
                            })
                            if(finalPenLogCount <= 1) {
                                const downUserInfo = await FinalUser.findOne({rank: finalUser * 0.6, cid})
                                await FinalUser.updateOne({
                                    userId: downUserInfo.userId, cid
                                }, {rank: finalUser * 0.6 + 1})
                                await FinalUser.updateOne({userId: uid, cid}, {rank: finalUser * 0.6})
                                await util.setUserAction(cid, 0, uid)
                            } else {
                                const downUserInfo = await FinalUser.findOne({rank: rank - 1, cid})
                                await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: rank})
                                await FinalUser.updateOne({
                                    userId: challengerUser.userId, cid
                                }, {rank: downUserInfo.rank})

                                await util.setUserAction(cid, downUserInfo.userId, challengerUser.userId)
                            }
                            //向下一位发送题目
                            //判断是不是到第一名
                            if(rank === 2) {
                                await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
                            }
                            await pushFinalPen(cid)
                            if(challengerUser.userId === uid) {
                                ctx.body = util.success({code: 200, msg: "挑战成功"}, '挑战成功')
                            } else {
                                ctx.body = util.success({code: 200, msg: "恭喜，守位成功"}, '守位成功')
                            }

                        } else {
                            //取消当前用户挑战这生命
                            await FinalUser.updateOne({userId: uid, cid}, {isChallenger: false})
                            //更改比赛终极排位赛轮次
                            await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
                            await pushFinalPen(cid)
                            await util.pushFinalInfo(4, cid)
                            if(challengerUser.userId === uid) {
                                ctx.body = util.success({code: 200, msg: "很遗憾,挑战失败"}, '挑战失败')
                            } else {
                                ctx.body = util.success({code: 200, msg: "恭喜，守位成功"}, '守位成功')
                            }
                        }
                    }
                    return false
                case 5:
                    //第5轮 31 vs 30
                    if(penInfo.penType === '场景题') {
                        // 需要等待两人答题完毕
                        const challengerUser = await FinalUser.findOne({rank: finalUser * 0.3 + 1, cid})
                        const answerLogs = await AnswerLog.find({
                            penId, cid, type: type + '-' + competeInfo['finalRounds'] + '-' + rounds
                        })
                        //回答完毕，判断得分
                        if(answerLogs.length >= 2) {
                            let challengerScore = 0;
                            let challengerTime = 0;
                            let otherScore = 0;
                            let otherTime = 0;

                            for(const answerLog of answerLogs) {
                                if(answerLog.uid === challengerUser.userId) {
                                    challengerScore = parseInt(answerLog.postAnswer)
                                    challengerTime = parseInt(answerLog.useTime)
                                } else {
                                    otherScore = parseInt(answerLog.postAnswer)
                                    otherTime = parseInt(answerLog.useTime)
                                }
                            }
                            if(challengerScore > otherScore) {
                                //挑战成功
                                const downUserInfo = await FinalUser.findOne({rank: finalUser * 0.3, cid})
                                await FinalUser.updateOne({
                                    userId: downUserInfo.userId, cid
                                }, {rank: finalUser * 0.3 + 1})
                                await FinalUser.updateOne({
                                    userId: challengerUser.userId,
                                    cid
                                }, {rank: finalUser * 0.3})
                                await util.setUserAction(cid, downUserInfo.userId, challengerUser.userId)
                                if(challengerUser.userId === uid) {
                                    ctx.body = util.success({code: 200, msg: "挑战成功"}, '挑战成功')
                                } else {
                                    ctx.body = util.success({code: 200, msg: "很遗憾，守位失败"}, '守位失败')
                                }
                            } else if(challengerScore === otherScore) {//分数相等，判断时间
                                if(challengerTime < otherTime) {
                                    const downUserInfo = await FinalUser.findOne({rank: finalUser * 0.3, cid})
                                    await FinalUser.updateOne({
                                        userId: downUserInfo.userId, cid
                                    }, {rank: finalUser * 0.3 + 1})
                                    await FinalUser.updateOne({
                                        userId: challengerUser.userId, cid
                                    }, {rank: finalUser * 0.3})
                                    await util.setUserAction(cid, downUserInfo.userId, challengerUser.userId)
                                    if(challengerUser.userId === uid) {
                                        ctx.body = util.success({code: 200, msg: "挑战成功"}, '挑战成功')
                                    } else {
                                        ctx.body = util.success({code: 200, msg: "很遗憾，守位失败"}, '守位失败')
                                    }
                                }
                            } else {
                                if(challengerUser.userId === uid) {
                                    ctx.body = util.success({code: 200, msg: "很遗憾,挑战失败"}, '挑战失败')
                                } else {
                                    ctx.body = util.success({code: 200, msg: "恭喜，守位成功"}, '守位成功')
                                }
                            }
                            await Compete.updateOne({cId: cid}, {finalRounds: 6}).exec()
                            await pushFinalPen(cid)
                            await util.pushFinalInfo(5, cid)
                            return false
                        } else {
                            ctx.body = util.success({code: 200, msg: "回答完成，等待另一个选手回答"}, '回答完成')
                            return false
                        }
                    } else {
                        const challengerUser = await FinalUser.findOne({rank: finalUser * 0.3 + 1, cid})
                        if(isRight && rank === finalUser * 0.3 + 1) {
                            // 31 胜利
                            const downUserInfo = await FinalUser.findOne({rank: finalUser * 0.3, cid})
                            await FinalUser.updateOne({
                                userId: downUserInfo.userId,
                                cid
                            }, {rank: finalUser * 0.3 + 1})
                            await FinalUser.updateOne({userId: uid, cid}, {rank: rank})
                            await util.setUserAction(cid, downUserInfo.userId, uid)
                            if(challengerUser.userId === uid) {
                                ctx.body = util.success({code: 200, msg: "挑战成功"}, '挑战成功')
                            } else {
                                ctx.body = util.success({code: 200, msg: "很遗憾，守位失败"}, '守位失败')
                            }
                        } else {
                            const challengerUser = await FinalUser.findOne({rank: finalUser * 0.3 + 1, cid})
                            if(challengerUser.userId === uid) {
                                ctx.body = util.success({code: 200, msg: "很遗憾,挑战失败"}, '挑战失败')
                            } else {
                                ctx.body = util.success({code: 200, msg: "恭喜，守位成功"}, '守位成功')
                            }
                        }
                        await Compete.updateOne({cId: cid}, {finalRounds: 6}).exec()
                        await pushFinalPen(cid)
                        await util.pushFinalInfo(5, cid)

                    }
                    return false
                case 6:
                    if(penInfo.penType === '场景题') {
                        // 需要等待两人答题完毕
                        const challengerUser = await FinalUser.findOne({rank: finalUser * 0.1 + 1, cid})
                        const answerLogs = await AnswerLog.find({
                            penId, cid, type: type + '-' + competeInfo['finalRounds'] + '-' + rounds
                        })
                        //回答完毕，判断得分
                        if(answerLogs.length >= 2) {
                            let challengerScore = 0;
                            let challengerTime = 0;
                            let otherScore = 0;
                            let otherTime = 0;

                            for(const answerLog of answerLogs) {
                                if(answerLog.uid === challengerUser.userId) {
                                    challengerScore = parseInt(answerLog.postAnswer)
                                    challengerTime = parseInt(answerLog.useTime)
                                } else {
                                    otherScore = parseInt(answerLog.postAnswer)
                                    otherTime = parseInt(answerLog.useTime)
                                }
                            }
                            if(challengerScore > otherScore) {
                                //挑战成功
                                const downUserInfo = await FinalUser.findOne({rank: finalUser * 0.1, cid})
                                await FinalUser.updateOne({
                                    userId: downUserInfo.userId, cid
                                }, {rank: finalUser * 0.1 + 1})
                                await FinalUser.updateOne({
                                    userId: challengerUser.userId,
                                    cid
                                }, {rank: finalUser * 0.1})

                                await util.setUserAction(cid, downUserInfo.userId, challengerUser.userId)

                                if(challengerUser.userId === uid) {
                                    ctx.body = util.success({code: 200, msg: "挑战成功"}, '挑战成功')
                                } else {
                                    ctx.body = util.success({code: 200, msg: "很遗憾，守位失败"}, '守位失败')
                                }

                            } else if(challengerScore === otherScore) {//分数相等，判断时间
                                if(challengerTime < otherTime) {
                                    const downUserInfo = await FinalUser.findOne({rank: finalUser * 0.1, cid})
                                    await FinalUser.updateOne({
                                        userId: downUserInfo.userId, cid
                                    }, {rank: finalUser * 0.1 + 1})
                                    await FinalUser.updateOne({
                                        userId: challengerUser.userId, cid
                                    }, {rank: finalUser * 0.1})
                                    await util.setUserAction(cid, downUserInfo.userId, challengerUser.userId)
                                    if(challengerUser.userId === uid) {
                                        ctx.body = util.success({code: 200, msg: "挑战成功"}, '挑战成功')
                                    } else {
                                        ctx.body = util.success({code: 200, msg: "很遗憾，守位失败"}, '守位失败')
                                    }
                                } else {

                                    if(challengerUser.userId === uid) {
                                        ctx.body = util.success({code: 200, msg: "很遗憾,挑战失败"}, '挑战失败')
                                    } else {
                                        ctx.body = util.success({code: 200, msg: "恭喜，守位成功"}, '守位成功')
                                    }
                                }
                            } else {
                                if(challengerUser.userId === uid) {
                                    ctx.body = util.success({code: 200, msg: "很遗憾,挑战失败"}, '挑战失败')
                                } else {
                                    ctx.body = util.success({code: 200, msg: "恭喜，守位成功"}, '守位成功')
                                }
                            }
                            await Compete.updateOne({cId: cid}, {finalRounds: 7}).exec()
                            await pushFinalPen(cid)
                            await util.pushFinalInfo(6, cid)
                            await util.competitionOver(cid)
                            return false
                        } else {
                            ctx.body = util.success({code: 200, msg: "回答完成，等待另一个选手回答"}, '回答完成')
                            return false
                        }
                    } else {
                        const challengerUser = await FinalUser.findOne({rank: finalUser * 0.1 + 1, cid})
                        if(isRight && rank === finalUser * 0.1 + 1) {
                            const downUserInfo = await FinalUser.findOne({rank: finalUser * 0.1, cid})
                            await FinalUser.updateOne({
                                userId: downUserInfo.userId,
                                cid
                            }, {rank: finalUser * 0.1 + 1})
                            await FinalUser.updateOne({userId: uid, cid}, {rank: rank})

                            await util.setUserAction(cid, downUserInfo.userId, uid)
                            if(challengerUser.userId === uid) {
                                ctx.body = util.success({code: 200, msg: "挑战成功"}, '挑战成功')
                            } else {
                                ctx.body = util.success({code: 200, msg: "很遗憾，守位失败"}, '守位失败')
                            }
                        } else {
                            const challengerUser = await FinalUser.findOne({rank: finalUser * 0.1 + 1, cid})
                            if(challengerUser.userId === uid) {
                                ctx.body = util.success({code: 200, msg: "很遗憾,挑战失败"}, '挑战失败')
                            } else {
                                ctx.body = util.success({code: 200, msg: "恭喜，守位成功"}, '守位成功')
                            }
                        }
                        await Compete.updateOne({cId: cid}, {finalRounds: 7}).exec()
                        await pushFinalPen(cid)
                        await util.pushFinalInfo(6, cid)
                        await util.competitionOver(cid)
                    }
                    return false
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
    const {cid, roomId, type, useTime, rounds, penId} = ctx.request.body
    if(type === 'final') {
        ctx.body = util.success({'code': 200, 'msg': ''})
        return
    }
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
    //记录当前房间的答题信息

    if(!roomId) {
        return false
    }
    const MatchInfo = await Match.findOne({_id: roomId, state: 2}).exec()
    await util.noteRoomLog({uid, roomId, rounds, cId: cid, isRight: false, useTime, type})
    if(!MatchInfo) {
        //通知客户端进行下一轮匹配
        const msg = {
            'event': 'matchMewRoom', 'message': {
                rounds: Math.random()
            }
        }
        //global.ws.send(roomId.toString(), JSON.stringify(msg), uid)
        global.redisClientPub.publish('newInfo', JSON.stringify({
            roomId: roomId.toString(), msg: msg, uid: uid, cId: cid
        }))
        await util.setRoomUserStatus(roomId)
        ctx.body = util.success({'code': 200, 'msg': '本轮答题已结束，自动匹配下一轮'})
        return false;
    }
    switch(type) {
        case 'must':
            //必答赛是不是最后一题
            await Match.updateOne({_id: roomId}, {currentRound: rounds + 1}).exec()
            if(rounds >= 5) {
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
                        //通知客户端进行下一轮匹配
                        const msg = {
                            'event': 'matchMewRoom', 'message': {
                                rounds: Math.random()
                            }
                        }
                        //global.ws.send(roomId.toString(), JSON.stringify(msg), roomLog.uid)
                        global.redisClientPub.publish('newInfo', JSON.stringify({
                            roomId: roomId.toString(), msg: msg, uid: roomLog.uid, cId: cid
                        }))
                    }
                    await util.setRoomUserStatus(roomId)
                    ctx.body = util.success({'code': 200, 'msg': '本轮答题已结束，自动匹配下一轮'})
                })
            } else {
                util.assignPen(roomId, cid).then(async() => {
                    await util.pushPen(roomId, cid, 'start')
                })
                ctx.body = util.success({'code': 200, 'msg': '马上加载下一题'})
                return false
            }
            break;

        case 'disuse':
            await Match.findOneAndUpdate({_id: roomId}, {state: 3}).then(async(matchInfo) => {
                const $allUsers = await User.find({_id: {$in: [matchInfo.userOneId, matchInfo.userTwoId]}})
                for(const userInfo of $allUsers) {
                    //通知客户端进行下一轮匹配
                    const msg = {
                        'event': 'matchMewRoom', 'message': {
                            rounds: Math.random()
                        }
                    }
                    //global.ws.send(roomId.toString(), JSON.stringify(msg), userInfo.userId)
                    global.redisClientPub.publish('newInfo', JSON.stringify({
                        roomId: roomId.toString(), msg: msg, uid: userInfo.userId, cId: cid
                    }))
                    ctx.body = util.success({'code': 200, 'msg': '本轮答题已结束，自动匹配下一轮'})
                }
                await util.setRoomUserStatus(roomId)
            })
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


module.exports = router
