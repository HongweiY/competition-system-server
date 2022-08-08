/**
 * 通用工具函数
 * @type {{}}
 */

const log4j = require('./log4j')
const jwt = require('jsonwebtoken')
const Pen = require("../models/penSchema");
const Match = require("../models/matchSchema");
const RoomLog = require("../models/roomLogSchema");
const Compete = require("../models/competeSchema");
const Counter = require("../models/counterSchema");
const AnswerLog = require("../models/answerLogSchema");
const Score = require("../models/scoreSchema");
const User = require("../models/userSchema");
const crypto = require('crypto');
const dayjs = require("dayjs");
const FinalUser = require("../models/finalUserSchema");
const FinalPenLogSchema = require("../models/finalPenLogSchema");
const mongoose = require("mongoose");
const Schedule = require("./schedule");
const CODE = {
    SUCCESS: 200, PARAM_ERROR: 10001, // 参数错误
    USER_ACCOUNT_ERROR: 20001, // 用户名密码错误
    USER_LOGIN_ERROR: 30001, // 用户未登录
    BUSINESS_ERROR: 40001, // 业务请求失败
    AUTH_ERROR: 50001// 权限验证失败
}
//解密数据
const key = '751f621ea5c8f930';
const iv = '2624750004598718';

const getJWTPayload = token => {
    return jwt.verify(token.split(' ')[1], 'ymfsder')
}

//排位赛资格
async function canGoFinal(userId, cid) {
    const userInfo = await FinalUser.findOne({userId, cid}).exec()
    if(!userInfo) {
        return false
    }
    const rank = userInfo['rank']
    const accuracy = ((userInfo['accuracy_number'] / userInfo['answer_number']) * 100).toFixed(2) + '%'
    //查询第几轮
    let competeInfo = await Compete.findOne({cId: cid})
    const finalUser = competeInfo['finalUser']
    let spacingCount = 5
    if(finalUser === 60) {
        spacingCount = 4
    }
    let allNumber = 0
    switch(competeInfo['finalRounds']) {
        case 1:
            allNumber = finalUser * 0.3 + spacingCount
            //第1轮 31-65  66-100 参加
            if(rank < finalUser * 0.3 + 1) {
                return false
                // } else if(rank > 65) {
            } else if(rank > finalUser * 0.6 + spacingCount) {
                return {
                    // allNumber: 35,
                    allNumber,
                    rank,
                    accuracy,
                    // area: '66-100名'
                    area: `${finalUser * 0.6 + spacingCount + 1}-${finalUser}名`
                }
            } else {
                return {
                    allNumber,
                    rank,
                    accuracy,
                    // area: '31-65名'
                    area: `${finalUser * 0.3 + 1}-${finalUser * 0.6 + spacingCount}名`
                }
            }
            //同时获得题目信息
            //总题目，和所在答题区域
            break;
        case 2:
            //第2轮 11-35  66-100 参加
            // if(rank < 11 || (rank > 35 && rank < 66)) {
            allNumber = finalUser * 0.2 + spacingCount
            if(rank < finalUser * 0.1 + 1 || (rank > finalUser * 0.3 + spacingCount && rank < finalUser * 0.6 + spacingCount + 1)) {
                return false
            } else if(rank > finalUser * 0.6 + spacingCount) {
                return {
                    // allNumber: 25,
                    allNumber,
                    rank,
                    accuracy,
                    area: `${finalUser * 0.6 + spacingCount + 1}-${finalUser}名`
                }
            } else {
                return {
                    allNumber,
                    rank,
                    accuracy,
                    // area: '11-35名'
                    area: `${finalUser * 0.1 + 1}-${finalUser * 0.3 + spacingCount}名`
                }
            }
        case 3:
            //第3轮 1-15 66-100 参加
            // if(rank > 15 && rank < 66) {
            allNumber = finalUser * 0.1 + spacingCount
            if(rank > finalUser * 0.1 + spacingCount && rank < finalUser * 0.6 + spacingCount + 1) {
                return false
            } else if(rank > finalUser * 0.6 + spacingCount) {
                return {
                    allNumber,
                    rank,
                    accuracy,
                    area: `${finalUser * 0.6 + spacingCount + 1}-${finalUser}名`
                }
            } else {
                return {
                    allNumber,
                    rank,
                    accuracy,
                    // area: '1-15名'
                    area: ` 1 -${finalUser * 0.1 + spacingCount}名`
                }
            }
            break;
        case 4:
            //第4轮
            // 第一题 66 vs 60 第二题 60 vs 59 。。59 58。。。
            // 第一题 41 vs 36 第二题 36 vs 35 。。35 34。。。
            //查询当前在第几题
            let rank_1, rank_2
            const finalPenLogCount = await FinalPenLogSchema.countDocuments({cid: cid, round: 4})
            if(finalPenLogCount <= 1) {
                // if(rank === 66 || rank === 60) {
                if(rank === finalUser * 0.6 + spacingCount + 1 || rank === finalUser * 0.6) {
                    rank_1 = finalUser * 0.6 + spacingCount + 1
                    rank_2 = finalUser * 0.6
                } else {
                    return false
                }
            } else {
                // if(rank === 62 - finalPenLogCount || rank === 61 - finalPenLogCount) {
                if(rank === finalUser * 0.6 + 2 - finalPenLogCount || rank === finalUser * 0.6 + 1 - finalPenLogCount) {
                    rank_1 = finalUser * 0.6 + 2 - finalPenLogCount
                    rank_2 = finalUser * 0.6 + 1 - finalPenLogCount
                } else {
                    return false
                }

            }

            //查询两个人信息推送

            const finalUserInfos = await FinalUser.find({rank: {$in: [rank_1, rank_2]}, cid}).exec()
            for(const finalUserInfo of finalUserInfos) {
                const msg = {
                    'event': 'finalUser',
                    'message': finalUserInfos
                }
                //global.ws.send('', JSON.stringify(msg), finalUserInfo.userId)
                global.redisClientPub.publish('newInfo', JSON.stringify({
                        roomId: '', msg: msg, uid: finalUserInfo.userId, cId: cid
                    }
                ))
                // finaUser.userId
            }
            return {
                allNumber: finalPenLogCount + 1,
                rank,
                accuracy,
                area: '复活赛'
            }

            break;
        case 5:
            //第5轮 31 vs 30
            // if(rank === 30 || rank === 31) {
            if(rank === finalUser * 0.3 || rank === finalUser * 0.3 + 1) {
                //查询两个人信息推送
                const finalUserInfos = await FinalUser.find({
                    rank: {$in: [finalUser * 0.3, finalUser * 0.3 + 1]},
                    cid
                }).exec()
                for(const finalUserInfo of finalUserInfos) {
                    const msg = {
                        'event': 'finalUser',
                        'message': finalUserInfos
                    }
                    //global.ws.send('', JSON.stringify(msg), finalUserInfo.userId)
                    global.redisClientPub.publish('newInfo', JSON.stringify({
                            roomId: '', msg: msg, uid: finalUserInfo.userId, cId: cid
                        }
                    ))
                }
                return {
                    allNumber: 1,
                    rank,
                    accuracy,
                    area: '银奖挑战'
                }
            } else {
                return false
            }
            break;
        case 6:
            //第6轮 11 vs  10
            if(rank === finalUser * 0.1 + 1 || rank === finalUser * 0.1) {

                //查询两个人信息推送
                const finalUserInfos = await FinalUser.find({
                    rank: {$in: [finalUser * 0.1 + 1, finalUser * 0.1]},
                    cid
                }).exec()
                console.log('finalUser * 0.1 + 1, finalUser * 0.1')
                console.log(finalUser * 0.1 + 1, finalUser * 0.1)
                for(const finalUserInfo of finalUserInfos) {
                    const msg = {
                        'event': 'finalUser',
                        'message': finalUserInfos
                    }
                    //global.ws.send('', JSON.stringify(msg), finalUserInfo.userId)
                    global.redisClientPub.publish('newInfo', JSON.stringify({
                            roomId: '', msg: msg, uid: finalUserInfo.userId, cId: cid
                        }
                    ))
                }
                return {
                    allNumber: 1,
                    rank,
                    accuracy,
                    area: '金奖挑战'
                }
            } else {
                return false
            }
            break;
    }
}

async function pushFinalPen(cid) {
    const https = require('https')
    const data = JSON.stringify({
        cid
    })

    const options = {
        hostname: 'api.ymfsder.com',
        port: 443,
        path: '/api/compete/pushFinalPen',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    }

    const req = https.request(options, res => {
        console.log(`状态码: ${res.statusCode}`)
        res.on('data', d => {
            process.stdout.write(d)
        })
    })

    req.on('error', error => {
        console.error(error)
    })
    req.write(data)
    req.end()
}

//推送终极排位赛题目
// async function pushFinalPen(cid) {
//     let competeInfo = await Compete.findOne({cId: cid})
//     const finaUsers = await FinalUser.find({cid})
//     //生成题目，写入数据库
//     const finalRounds = competeInfo['finalRounds']
//     //终极排位赛 第4 5 6轮使用场景题
//     let params = {}
//     if(finalRounds === 4 || finalRounds === 5 || finalRounds === 6) {
//         params.penType = {$in: ['判断', '多选', '单选', '场景题']}
//         // params.penType = {$in: ['场景题']}
//     } else {
//         params.penType = {$in: ['判断', '多选', '单选']}
//     }
//     const penInfo = await Pen.aggregate().match(params).sample(1)
//     const finalPenLog = await FinalPenLogSchema.find({
//         cid: cid, round: finalRounds
//     }).sort({penNumber: -1}).limit(1).exec()
//
//     let penRoundsNumber = 1
//     if(finalPenLog[0]) {
//         penRoundsNumber = finalPenLog[0]['penNumber'] + 1
//     }
//     //将新数据写入数据
//     await FinalPenLogSchema.create({
//         cid: cid,//竞赛id
//         round: finalRounds,//轮数
//         penId: penInfo[0].penId, penInfo: penInfo[0],//题目
//         penNumber: penRoundsNumber,//第几题
//         pushTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
//     })
//     //更新题目推送时间和倒计时。
//     let countDown = 30
//     //根据题目是否有倒计时自动设置
//     if(penInfo[0]['time'] > 0) {
//         countDown = penInfo[0]['time']
//     }
//     for(const finaUser of finaUsers) {
//         const canGo = await canGoFinal(finaUser.userId, cid)
//         if(canGo) {
//             const msg = {
//                 'event': 'pushFinalPen', 'message': {
//                     rounds: finalRounds,
//                     penRoundsNumber: penRoundsNumber,  // 当前所在题目
//                     allNum: canGo.allNumber,
//                     area: canGo.area,
//                     rank: canGo.rank,
//                     accuracy: canGo.accuracy === 'NaN%' ? '0%' : canGo.accuracy,
//                     countDown, //'剩余倒计时'
//                     'penId': penInfo[0].penId,
//                     'penType': penInfo[0].penType,
//                     'stem': penInfo[0].stem,
//                     'options': penInfo[0].options,
//                     'src': penInfo[0].src,
//
//                 }
//             }
//             //global.ws.send('', JSON.stringify(msg), finaUser.userId)
//             global.redisClientPub.publish('newInfo', JSON.stringify({
//                 roomId: '', msg: msg, uid: finaUser.userId, cId: cid
//             }))
//         }
//     }
//     const taskStartTime = dayjs().add(countDown, 'second')
//     const second = taskStartTime.get('second')
//     const minute = taskStartTime.get('minute')
//     const hour = taskStartTime.get('hour')
//     const date = taskStartTime.get('date')
//     const month = taskStartTime.get('month')
//     const schedule = new Schedule({
//         unit_name: '自动题目切换',
//         maintain_time: `${second} ${minute} ${hour} ${date} ${month + 1} *`, //2016年的1月1日1点1分30秒触发
//         last_alarm: '自动题目切换'
//     }).create(async() => {
//         //判断终极排位赛人数
//         const finalUser = competeInfo['finalUser']
//         let spacingCount = 5
//         if(finalUser === 60) {
//             spacingCount = 4
//         }
//         switch(competeInfo['finalRounds']) {
//             case 1:
//                 const finalPenLog_1 = await FinalPenLogSchema.find({
//                     cid: cid, round: 1
//                 }).sort({penNumber: -1}).limit(1).exec()
//                 if(finalPenLog_1 && finalPenLog_1[0]['penNumber'] >= finalUser * 0.3 + spacingCount) {
//                     Compete.updateOne({cId: cid}, {finalRounds: 2}).exec().then(async() => {
//                         await pushFinalPen(cid)
//                     })
//                     await pushFinalInfo(1, cid)
//                 } else {
//                     await pushFinalPen(cid)
//                 }
//                 break;
//             case 2:
//                 const finalPenLog_2 = await FinalPenLogSchema.find({
//                     cid: cid, round: 2
//                 }).sort({penNumber: -1}).limit(1).exec()
//                 if(finalPenLog_2 && finalPenLog_2[0]['penNumber'] >= finalUser * 0.2 + spacingCount) {
//                     Compete.updateOne({cId: cid}, {finalRounds: 3}).exec().then(async() => {
//                         await pushFinalPen(cid)
//                     })
//                     await pushFinalInfo(2, cid)
//                 } else {
//                     await pushFinalPen(cid)
//                 }
//                 break;
//             case 3:
//                 //第3轮 1-15 66-100 参加
//                 //第2轮 11-35  66-100 参加
//                 const finalPenLog_3 = await FinalPenLogSchema.find({
//                     cid: cid, round: 3
//                 }).sort({penNumber: -1}).limit(1).exec()
//                 if(finalPenLog_3 && finalPenLog_3[0]['penNumber'] >= finalUser * 0.1 + spacingCount) {
//                     await pushFinalInfo(3, cid)
//                     await Compete.updateOne({cId: cid}, {finalRounds: 4}).exec()
//                     //确定挑战者
//                     const changeUser = await FinalUser.find({
//                         cid, rank: {$gt: finalUser * 0.6 + spacingCount}
//                     }).sort({accuracy_number: -1}).limit(1)
//                     //查询
//                     await FinalUser.updateOne({rank: finalUser * 0.6 + spacingCount + 1, cid}, {
//                         rank: finalUser + 1
//                     })
//                     await FinalUser.updateOne({userId: changeUser[0].userId, cid}, {
//                         isChallenger: true, rank: finalUser * 0.6 + spacingCount + 1
//                     })
//                     await pushFinalPen(cid)
//                 } else {
//                     await pushFinalPen(cid)
//                 }
//                 break;
//             case 4:
//                 //第4轮
//                 const challenger = await FinalUser.findOne({isChallenger: true}).exec()
//                 const challengerUserId = challenger['userId']
//                 const challengerRank = challenger['rank']
//                 if(penInfo.penType === '场景题') {
//                     // 需要等待两人答题完毕
//                     const answerLogs = await AnswerLog.findOne({
//                         penId,
//                         cid,
//                         type: `${type}-${competeInfo['finalRounds']}-${penRoundsNumber}`,
//                         uid: challengerUserId
//                     })
//                     // 判断当前用户有没有答题，答题且分数大于0，挑战成功
//                     if(answerLogs && answerLogs.postAnswer > 0) {
//                         //挑战成功,
//                         //判断是不是第一次
//                         const finalPenLogCount = await FinalPenLogSchema.countDocuments({
//                             cid: cid, round: 4
//                         })
//                         if(finalPenLogCount === 1) {
//                             //被挑战者
//                             const downUserInfo = await FinalUser.findOne({rank: finalUser * 0.6, cid})
//                             await FinalUser.updateOne({userId: challengerUserId, cid}, {
//                                 rank: finalUser * 0.6,
//                                 answer_time: challenger.answer_time + answerLogs.useTime,
//                                 answer_number: challenger.answer_number + 1,
//                                 accuracy_number: challenger.accuracy_number + (answerLogs.isRight ? 1 : 0),
//                             })
//                             // await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: challenger.rank})
//                         } else {
//                             const downUserInfo = await FinalUser.findOne({rank: challengerRank - 1, cid})
//                             await FinalUser.updateOne({userId: challengerUserId, cid}, {
//                                 rank: challengerRank - 1,
//                                 answer_time: challenger.answer_time + answerLogs.useTime,
//                                 answer_number: challenger.answer_number + 1,
//                                 accuracy_number: challenger.accuracy_number + (answerLogs.isRight ? 1 : 0),
//                             })
//                             if(downUserInfo) {
//                                 await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: challengerRank})
//                             }
//
//                         }
//                         //判断是不是到第一名
//                         if(challengerRank === 2) {
//                             await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
//                         }
//                         //向下一位发送题目
//                         await pushFinalPen(cid)
//                     } else {
//                         await FinalUser.updateOne({userId: challengerUserId, cid}, {isChallenger: false})
//                         //更改比赛终极排位赛轮次
//                         await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
//                         await pushFinalPen(cid)
//                     }
//                 } else {
//                     //取消当前用户挑战这生命
//                     await FinalUser.updateOne({userId: challengerUserId, cid}, {isChallenger: false})
//                     //更改比赛终极排位赛轮次
//                     await Compete.updateOne({cId: cid}, {finalRounds: 5}).exec()
//                     await pushFinalPen(cid)
//
//                 }
//                 break;
//             case 5:
//                 //第5轮 31 vs 30
//                 if(penInfo.penType === '场景题') {
//                     // 需要等待两人答题完毕
//                     const challenger = await FinalUser.findOne({rank: finalUser * 0.3 + 1}).exec()
//                     const challengerUserId = challenger['userId']
//                     const challengerRank = challenger['rank']
//                     const answerLogs = await AnswerLog.findOne({
//                         penId,
//                         cid,
//                         type: `${type}-${competeInfo['finalRounds']}-${penRoundsNumber}`,
//                         uid: challengerUserId
//                     })
//                     // 判断当前用户有没有答题，答题且分数大于0，挑战成功
//                     if(answerLogs && answerLogs.postAnswer > 0) {
//                         //挑战成功
//                         const downUserInfo = await FinalUser.findOne({rank: challengerRank - 1, cid})
//                         await FinalUser.updateOne({userId: challengerUserId, cid}, {
//                             rank: challengerRank - 1,
//                             answer_time: challenger.answer_time + answerLogs.useTime,
//                             answer_number: challenger.answer_number + 1,
//                             accuracy_number: challenger.accuracy_number + (answerLogs.isRight ? 1 : 0),
//                         })
//                         if(downUserInfo) {
//                             await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: challengerRank})
//                         }
//                     } else {
//                         await Compete.updateOne({cId: cid}, {finalRounds: 6}).exec()
//                         await pushFinalPen(cid)
//                     }
//                 } else {
//                     await Compete.updateOne({cId: cid}, {finalRounds: 6}).exec()
//                     await pushFinalPen(cid)
//                 }
//                 break;
//             case 6:
//                 if(penInfo.penType === '场景题') {
//                     const challenger = await FinalUser.findOne({rank: ffinalUser * 0.1 + 1}).exec()
//                     const challengerUserId = challenger['userId']
//                     const challengerRank = challenger['rank']
//                     const answerLogs = await AnswerLog.findOne({
//                         penId,
//                         cid,
//                         type: `${type}-${competeInfo['finalRounds']}-${penRoundsNumber}`,
//                         uid: challengerUserId
//                     })
//                     // 判断当前用户有没有答题，答题且分数大于0，挑战成功
//                     if(answerLogs && answerLogs.postAnswer > 0) {
//                         const downUserInfo = await FinalUser.findOne({rank: challengerRank - 1, cid})
//                         await FinalUser.updateOne({userId: challengerUserId, cid}, {
//                             rank: challengerRank - 1,
//                             answer_time: challenger.answer_time + answerLogs.useTime,
//                             answer_number: challenger.answer_number + 1,
//                             accuracy_number: challenger.accuracy_number + (answerLogs.isRight ? 1 : 0),
//                         })
//                         if(downUserInfo) {
//                             await FinalUser.updateOne({userId: downUserInfo.userId, cid}, {rank: challengerRank})
//                         }
//                     } else {
//                         await Compete.updateOne({cId: cid}, {finalRounds: 7}).exec()
//                         await competitionOver(cid)
//                     }
//                 } else {
//                     await Compete.updateOne({cId: cid}, {finalRounds: 7}).exec()
//                     await competitionOver(cid)
//                 }
//                 break;
//         }
//     })
//     //向所有用户推送信息
//     await pushCurrentFinalInfo(cid, finalRounds, penRoundsNumber)
// }

//推送竞赛信息
async function pushFinalInfo(round, cid) {
    let message = ''
    let finalUserInfos = []
    let competeInfo = await Compete.findOne({cId: cid})
    const finalUser = competeInfo['finalUser']
    let spacingCount = 5
    if(finalUser === 60) {
        spacingCount = 4
    }
    switch(round) {
        case 1:
            // finalUserInfos = await FinalUser.find({rank: {$gt: 30, $lt: 66}, cid}).exec()
            finalUserInfos = await FinalUser.find({
                rank: {
                    $gt: finalUser * 0.3,
                    $lt: finalUser * 0.6 + spacingCount + 1
                },
                cid
            }).exec()
            message = `终极排位赛，第一轮：${finalUser * 0.3 + 1}-${finalUser * 0.6 + spacingCount}名 答题已结束`
            break;
        case 2:
            //第2轮 11-35  66-100 参加
            finalUserInfos = await FinalUser.find({
                rank: {
                    $gt: finalUser * 0.1,
                    $lt: finalUser * 0.3 + spacingCount + 1
                }, cid
            }).exec()
            message = `终极排位赛，第二轮：${finalUser * 0.1 + 1}-${finalUser * 0.3 + spacingCount}名 答题已结束`
            break;
        case 3:
            //第3轮 1-15 66-100 参加
            finalUserInfos = await FinalUser.find({
                cid,
                $or: [
                    {rank: {$lt: finalUser * 0.1 + spacingCount}},
                    {rank: {$gt: finalUser * 0.6 + spacingCount, $lt: finalUser + 1}}]
            }).exec()
            message = `终极排位赛，第三轮：1-${finalUser * 0.1 + spacingCount}名 答题已结束`
            break;
        case 4:
            let rank_1, rank_2
            const finalPenLogCount = await FinalPenLogSchema.countDocuments({cid: cid, round: 4,})
            if(finalPenLogCount === 1) {
                rank_1 = finalUser * 0.6 + spacingCount + 1
                rank_2 = finalUser * 0.6
            } else {
                rank_1 = finalUser * 0.6 + 2 - finalPenLogCount
                rank_2 = finalUser * 0.6 + 1 - finalPenLogCount
            }
            //查询两个人信息推送
            finalUserInfos = await FinalUser.find({cid, rank: {$in: [rank_1, rank_2]}}).exec()
            message = '终极排位赛，第四轮，第 1 场 答题已结束'
            break;
        case 5:
            //第5轮 31 vs 30
            finalUserInfos = await FinalUser.find({cid, rank: {$in: [finalUser * 0.3, finalUser * 0.3 + 1]}}).exec()
            message = '终极排位赛，第四轮，第 2 场 答题已结束'
            break;
        case 6:
            // finalUserInfos = await FinalUser.find({cid, rank: {$in: [finalUser * 0.1, finalUser * 0.3 + 1]}}).exec()
            // message = '终极排位赛，第六轮，答题已结束'
            // break;
            finalUserInfos = await FinalUser.find({cid}).exec()
            message = '终极排位赛，第四轮，第 3 场 答题已结束'
            break;
        case 7:
            finalUserInfos = await FinalUser.find({cid}).exec()
            message = '比赛结束'
            break;
    }
    //更新题目推送时间和倒计时。
    for(const finaUser of finalUserInfos) {
        const msg = {
            'event': 'pushFinalMessage',
            'message': message
        }
        //global.ws.send('', JSON.stringify(msg), finaUser.userId)
        global.redisClientPub.publish('newInfo', JSON.stringify({
                roomId: '', msg: msg, uid: finaUser.userId, cId: cid
            }
        ))
    }
}

async function setUserAction(cid, downUid, upUid) {

    FinalUser.updateMany({cid}, {action: 'none'}).then(async() => {
        console.log('downUid, upUid')
        console.log(downUid, upUid)
        await FinalUser.updateOne({userId: downUid}, {action: 'down'}).exec()
        await FinalUser.updateOne({userId: upUid}, {action: 'up'}).exec()
    })
}

async function competitionOver(cid) {
    const finalUserInfos = await FinalUser.find({cid}).exec()
    for(const finaUser of finalUserInfos) {
        //推送竞赛结束
        const msg = {
            'event': 'gameOver', 'message': {
                rank: finaUser.rank
            }
        }
        global.redisClientPub.publish('newInfo', JSON.stringify({
            roomId: '', msg: msg, uid: finaUser.userId, cId: cid
        }))
    }
}

//生成题目
async function assignPen(roomId, cid) {
    //排除当前已经回答过的题目
    const matchInfo = await Match.findOne({_id: roomId})
    const answerLogs = await AnswerLog.find({roomId, cid})
    let penIds = []
    for(const answerLog of answerLogs) {
        const penId = answerLog.penId
        if(!penIds.includes(penId)) {
            penIds.push(penId)
        }
    }
    let penInfo
    let params = {}
    params.penType = {$in: ['判断', '多选', '单选',]}
    if(penIds.length > 0) {
        do {
            penInfo = await Pen.aggregate().match(params).sample(1)
        } while(penIds.includes(penInfo[0].penId));
    } else {
        penInfo = await Pen.aggregate().match(params).sample(1)
    }
    //更新题目推送时间和倒计时。
    await Match.updateOne({_id: roomId, cid}, {
        'pushTime': dayjs().format('YYYY-MM-DD HH:mm:ss'),
        'pushPen': matchInfo['pushPen'].length > 0 ? matchInfo['pushPen'].concat(penInfo[0]) : penInfo[0]
    })
}

//推送题目
async function pushPen(roomId, cid, type = 'end', uid = 'all') {

    //直接读取相应的题目返回
    let matchInfo = await Match.findOne({_id: roomId})
    const countDown = 25 - (dayjs().unix() - dayjs(matchInfo['pushTime']).unix())
    let allNum = 1
    //总题目数量
    const competeInfo = await Compete.findOne({cId: cid})
    if(competeInfo['currentType'] === 'must') {
        allNum = 5
    }

    const penRoundsNumber = matchInfo['currentRound']
    const penInfo = matchInfo['pushPen'][penRoundsNumber - 1]

    if(type === 'end') {
        const returnRounds = await RoomLog.countDocuments({uid: uid, cId: cid, type: competeInfo['currentType']})
        const msg = {
            'event': 'pushPen',
            'message': {
                rounds: returnRounds + 1,
                penRoundsNumber,  // 当前所在题目
                allNum,
                countDown, //'剩余倒计时'
                'penId': penInfo.penId,
                'penType': penInfo.penType,
                'stem': penInfo.stem,
                'options': penInfo.options,
                'src': penInfo.src,
                'author': penInfo.author
            }
        }
        global.redisClientPub.publish('newInfo', JSON.stringify({
                roomId: '', msg: msg, uid: uid, cId: cid
            }
        ))
    } else {
        //给所有人推送题目，默认
        let $allUsers
        if(competeInfo['currentType'] === 'must') {
            $allUsers = await User.find({_id: {$in: [matchInfo.userOneId, matchInfo.userTwoId, matchInfo.userThreeId, matchInfo.userFourId]}})
        } else {
            $allUsers = await User.find({_id: {$in: [matchInfo.userOneId, matchInfo.userTwoId]}})
        }
        for(const userInfo of $allUsers) {
            let returnRounds = await RoomLog.countDocuments({
                uid: userInfo.userId, cId: cid, type: competeInfo['currentType'], roomId: {$ne: roomId}
            })
            const msg = {
                'event': 'pushPen',
                'message': {
                    uid: userInfo.userId,
                    rounds: returnRounds + 1,
                    penRoundsNumber,  // 当前所在题目
                    allNum,
                    countDown, //'剩余倒计时'
                    'penId': penInfo.penId,
                    'penType': penInfo.penType,
                    'stem': penInfo.stem,
                    'options': penInfo.options,
                    'src': penInfo.src,
                    'author': penInfo.author

                }
            }
            global.redisClientPub.publish('newInfo', JSON.stringify({
                    roomId: roomId.toString(), msg: msg, uid: userInfo.userId, cId: cid
                }
            ))
        }


    }
}

/**
 * 开启新比赛后，重新设置用户状态
 * @param roomId
 * @returns {Promise<void>}
 */
async function setRoomUserStatus(roomId) {
    const matchUserInfo = await Match.findById(roomId).exec()
    //查询用户是否离开
    if(global.redisClient.get(matchUserInfo['userOneId'])) {
        await global.redisClient.get(matchUserInfo['userOneId']) === 'leave' ? "" : await global.redisClient.set(matchUserInfo['userOneId'], "ready")

    }
    if(global.redisClient.get(matchUserInfo['userOneId'])) {
        await global.redisClient.get(matchUserInfo['userTwoId']) === 'leave' ? "" : await global.redisClient.set(matchUserInfo['userTwoId'], "ready")

    }
    if(global.redisClient.get(matchUserInfo['userOneId'])) {
        await global.redisClient.get(matchUserInfo['userThreeId']) === 'leave' ? "" : await global.redisClient.set(matchUserInfo['userThreeId'], "ready")

    }
    if(global.redisClient.get(matchUserInfo['userOneId'])) {
        await global.redisClient.get(matchUserInfo['userFourId']) === 'leave' ? "" : await global.redisClient.set(matchUserInfo['userFourId'], "ready")

    }
}

async function exercise(params) {

    const {cid, type, userId} = params
    const userInfo = await User.findById(userId).exec()
    //查询正在匹配的房间
    //状态state 1 匹配中 2 正在比赛 3当前房间答题已结束
    //type: 匹配类型 must  disuse
    let matchInfo = await Match.findOneAndUpdate({$and: [{cid}, {type}, {state: {$in: [1]}}]}, {state: 4})
    //更具房间人数添加人员
    if(matchInfo) {
        const _id = matchInfo._id
        switch(type) {
            case 'must':
                await Match.updateOne({_id: _id}, {
                    userFourId: userId,
                    userCount: 4,
                    state: 2
                })
                break
            case 'disuse':
                await Match.updateOne({_id: _id}, {userTwoId: userId, userCount: 2, state: 2})
                break
        }
        const msg = {
            'event': 'matchingSuccess',
            'message': _id
        }
        global.redisClientPub.publish('newInfo', JSON.stringify({
                roomId: '', msg: msg, uid: userInfo.userId, cId: cid
            }
        ))
        // return _id
    }


    return false


}

//开始匹配
async function startMatch(params) {
    const {cid, type, userId} = params
    if(!userId) {
        return false
    }
    //cid =1 和cid=2时，走新的逻辑
    if(cid == 1 || cid == 2) {
        //演练信息
        return await exercise(params)
    }

    // 判断用户是否已经在房间中
    let isExitMatch = await Match.findOne({
        $and: [{cid}, {type}, {state: 2}, {$or: [{userOneId: userId}, {userTwoId: userId}, {userThreeId: userId}, {userFourId: userId}]}]
    })
    const MaxUserCount = {
        'must': 4, 'disuse': 2, 'final': 2,
    }

    //用户在房间里面。直接返回
    if(isExitMatch) {
        const userInfo = await User.findById(userId).exec()
        await pushPen(isExitMatch._id, cid, 'end', userInfo.userId)
        return isExitMatch._id

    } else {
        //将用户写入redis集合
        const userStatus = await global.redisClient.get(userId)

        if(!userStatus) {
            await global.redisClient.set(userId, "ready");
        }
        if(userStatus === 'ready' || !userStatus) {
            let MatchUsers
            await global.redisClient.sadd('match-user', userId);
            await global.redisClient.set(userId, 'matching')
            //修改redis状态
            //判断长度
            const userNum = await global.redisClient.scard('match-user')
            if(userNum >= MaxUserCount[type]) {
                MatchUsers = await global.redisClient.spop('match-user', MaxUserCount[type]);
                if(MatchUsers.length < MaxUserCount[type]) {
                    for(let i = 0; i < MaxUserCount[type]; i++) {
                        if(MatchUsers[i]) {
                            await global.redisClient.sadd('match-user', MatchUsers[i])
                            await global.redisClient.set(MatchUsers[i], 'ready')
                        }
                    }
                    return false
                } else {
                    for(let i = 0; i < MaxUserCount[type]; i++) {
                        if(MatchUsers[i]) {
                            await global.redisClient.set(MatchUsers[i], 'gaming')
                        }
                    }
                }

                const counterDoc = await Counter.findOneAndUpdate({_id: 'matchId'}, {$inc: {sequenceValue: 1}}, {new: true})
                let res
                if(type === 'must') {
                    if(MatchUsers) {
                        res = await Match.create({
                            mId: counterDoc.sequenceValue,
                            cid,//竞赛id
                            type,//匹配类型 must  disuse
                            userCount: 4,//当前房间人数
                            userOneId: MatchUsers[0],
                            userTwoId: MatchUsers[1],
                            userThreeId: MatchUsers[2],
                            userFourId: MatchUsers[3],
                            state: 2,
                            currentRound: 1
                        })
                    }

                } else {
                    if(MatchUsers) {
                        res = await Match.create({
                            mId: counterDoc.sequenceValue,
                            cid,//竞赛id
                            type,//匹配类型 must  disuse
                            userCount: 2,//当前房间人数
                            userOneId: MatchUsers[0],
                            userTwoId: MatchUsers[1],
                            state: 2,
                            currentRound: 1
                        })
                    }
                }
                await assignPen(res._id, cid)
                const msg = {
                    'event': 'matchingSuccess',
                    'message': res._id
                }

                for(const MatchUser of MatchUsers) {
                    const userInfo = await User.findById(MatchUser).exec()
                    global.redisClientPub.publish('newInfo', JSON.stringify({
                            roomId: '', msg: msg, uid: userInfo.userId, cId: cid
                        }
                    ))
                }

            }
            //将用户数据写入房间返回房间号
            //判断长度
            //没有，创建一个房间

        }
    }

    return true

}

//分发匹配信息
async function matchUserInfo(roomID) {
    const matchUserInfo = await Match.findById(roomID).populate(['userOneId', 'userTwoId', 'userThreeId', 'userFourId']).exec()

    if(matchUserInfo.userOneId) {
        const score = await Score.findOne({competeId: matchUserInfo.cid, userId: matchUserInfo.userOneId._id})
        if(score) {
            matchUserInfo.userOneId.score = score.score
        }
    }
    if(matchUserInfo.userTwoId) {
        const score = await Score.findOne({competeId: matchUserInfo.cid, userId: matchUserInfo.userTwoId._id})
        if(score) {
            matchUserInfo.userTwoId.score = score.score
        }
    }
    if(matchUserInfo.userThreeId) {

        const score = await Score.findOne({competeId: matchUserInfo.cid, userId: matchUserInfo.userThreeId._id})
        if(score) {
            matchUserInfo.userThreeId.score = score.score
        }
    }
    if(matchUserInfo.userFourId) {
        const score = await Score.findOne({competeId: matchUserInfo.cid, userId: matchUserInfo.userFourId._id})
        if(score) {
            matchUserInfo.userFourId.score = score.score
        }
    }

    const msg = {
        'event': 'matchRoom', 'message': matchUserInfo
    }
    //查询用户的成绩

    Score.findOne()
    //global.ws.send(roomID.toString(), JSON.stringify(msg))
    global.redisClientPub.publish('newInfo', JSON.stringify({
            roomId: roomID.toString(), msg: msg, uid: '', cId: matchUserInfo.cid
        }
    ))
}


/**
 * 分发匹配信息
 * @param roomID 房间ID objectid
 * @param rounds 当前房间第几轮
 * @returns {Promise<void>}
 */
async function answerInfo(roomID, rounds) {
    const matchUserInfo = await Match.findById(roomID).exec()
    let userInfos = await User.find({_id: {$in: [matchUserInfo.userOneId, matchUserInfo.userTwoId, matchUserInfo.userThreeId, matchUserInfo.userFourId]}})
    const roomLogs = await RoomLog.find({roomId: roomID})

    let returnData = []
    for(const userInfo of userInfos) {
        let template = {}
        for(const roomLog of roomLogs) {
            if(userInfo['userId'] == roomLog['uid']) {
                template.useTime = roomLog['useTime']
                //如果当前是淘汰赛则不传递积分
                const competitionInfo = await Compete.findOne({cId: matchUserInfo.cid})
                if(competitionInfo['currentType'] === 'must') {
                    template.score = roomLog['rightNumber']
                } else {

                    const scoreInfo = await Score.findOne({userId: userInfo._id, competeId: matchUserInfo.cid})
                    if(scoreInfo) {
                        template.score = scoreInfo['score']
                        template.useTime = scoreInfo['answer_time']
                    } else {
                        template.score = 0
                    }

                }

            }
        }
        const answerLog = await AnswerLog.findOne({roomId: roomID, uid: userInfo['userId'], rounds}).exec()
        if(answerLog) {
            if(answerLog['isRight']) {
                template.isRight = true
            } else {
                template.isRight = false
            }
        }

        returnData.push({
            ...template, _id: userInfo._id
        })

    }

    const msg = {
        'event': 'pushAnswerInfo', 'message': returnData
    }
    //global.ws.send(roomID.toString(), JSON.stringify(msg), 'all')
    global.redisClientPub.publish('newInfo', JSON.stringify({
            roomId: roomID.toString(), msg: msg, uid: 'all', cId: matchUserInfo.cid
        }
    ))


}


async function noteRoomLog(params) {
    const {uid, roomId, rounds, cId, isRight, useTime, type} = params
    const roomLog = await RoomLog.findOne({$and: [{uid}, {roomId}, {cId}, {type}]}).exec()
    if(roomLog) {
        await RoomLog.updateOne({_id: roomLog._id}, {

            rounds,
            rightNumber: isRight ? roomLog.rightNumber + 1 : roomLog.rightNumber,
            useTime: roomLog.useTime + useTime,
        })
    } else {
        await RoomLog.create({
            uid, roomId, rounds, cId, rightNumber: isRight ? 1 : 0, useTime, type
        })
    }
}


async function userRank(cId, uid) {
    const competitionInfo = await Compete.findOne({cId: cId}).exec()
    const currentType = competitionInfo['currentType']
    let myRank = 0
    let currentRankInfo = []
    if(currentType === 'final') {
        const userInfo = await User.findById(uid).exec()
        const finalUser = await FinalUser.findOne({cId, userId: userInfo.userId}).exec()
        if(finalUser) {
            myRank = finalUser.rank
            currentRankInfo = finalUser
        }
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
                    'competeId': parseInt(cId)
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
                                "userId": new mongoose.Types.ObjectId(uid),
                                'competeId': parseInt(cId)
                            }
                        }
                    ],
                }
            }
        ])

        myRank = info[0]['my'][0] ? info[0]['my'][0]['arrayIndex'] : 0
        currentRankInfo = info[0]['my'][0] ? info[0]['my'][0] : []
    }
    return {myRank, currentRankInfo}
}

/**
 * 推送终极排位赛的最后信息
 * @param cid 竞赛id
 * @param rounds 当前轮次
 * @param penRoundsNumber 当前题目
 * @returns {Promise<void>}
 */
async function pushCurrentFinalInfo(cid, rounds, penRoundsNumber) {
    let finalUserInfos = []
    let rank_1, rank_2
    let competeInfo = await Compete.findOne({cId: cid}).exec()
    const finalUser = competeInfo['finalUser']
    let spacingCount = 5
    if(finalUser === 60) {
        spacingCount = 4
    }
    switch(rounds) {
        case 1:
            finalUserInfos = await FinalUser.find({rank: {$lt: finalUser * 0.3 + 1}, cid}).exec()
            break;
        case 2:
            finalUserInfos = await FinalUser.find({
                cid,
                $or: [{rank: {$lt: finalUser * 0.1}}, {
                    rank: {
                        $gt: finalUser * 0.3 + spacingCount,
                        $lt: finalUser * 0.6 + spacingCount + 1
                    }
                }]
            }).exec()
            break;
        case 3:
            finalUserInfos = await FinalUser.find({
                rank: {
                    $lt: finalUser * 0.6 + spacingCount + 1,
                    $gt: finalUser * 0.1 + spacingCount
                }, cid
            }).exec()
            break;
        case 4:
            const finalPenLogCount = await FinalPenLogSchema.countDocuments({cid: cid, round: 4,})
            if(finalPenLogCount === 1) {
                rank_1 = finalUser * 0.6 + spacingCount + 1
                rank_2 = finalUser * 0.6
            } else {
                rank_1 = finalUser * 0.6 + 2 - finalPenLogCount
                rank_2 = finalUser * 0.6 + 1 - finalPenLogCount
            }
            //查询两个人信息推送
            finalUserInfos = await FinalUser.find({cid, rank: {$nin: [rank_1, rank_2]}}).exec()
            break;
        case 5:
            //第5轮 31 vs 30
            finalUserInfos = await FinalUser.find({cid, rank: {$nin: [finalUser * 0.3, finalUser * 0.3 + 1]}}).exec()
            break;
        case 6:
            finalUserInfos = await FinalUser.find({cid, rank: {$nin: [finalUser * 0.1, finalUser * 0.1 + 1]}}).exec()
            break;
    }
    //生成题目，写入数据库
    for(const finaUser of finalUserInfos) {
        const rank = finaUser.rank
        let userRounds = ''
        let showMessage = '请不要离开，等待题目推送'
        if(rank < finalUser * 0.6 + spacingCount + 1 && rank > finalUser * 0.3) {
            userRounds = '第 1 轮'
            if(rounds > 1) {
                showMessage = '你的答题已经结束'
            }

        }
        if(rank < finalUser * 0.3 + spacingCount + 1 && rank > finalUser * 0.1) {
            userRounds = '第 2 轮'
            if(rounds > 2) {
                showMessage = '你的答题已经结束'
            }
        }
        if(rank < finalUser * 0.1 + spacingCount + 1) {
            userRounds = userRounds === '' ? '第 3 轮' : userRounds + '、第 3 轮'
            if(rounds > 3) {
                showMessage = '你的答题已经结束'
            }
        }

        if(rank === finalUser * 0.3 || rank === finalUser * 0.3 + 1) {
            userRounds = userRounds === '' ? '第 4 轮第 2 场' : userRounds + '、第 4 轮-第 2 场'
        }
        if(rank === finalUser * 0.1 || rank === finalUser * 0.1 + 1) {
            userRounds = userRounds === '' ? '第 4 轮第 3 场' : userRounds + '、第 4 轮-第 3 场'
        }
        // if(rounds === 4 && (rank === rank_1 || rank === rank_2)) {
        //     userRounds = userRounds === '' ? '第 4 轮第 1 场' : userRounds + '、第 4 轮-第 1 场'
        // }
        if(rank === finalUser * 0.6) {
            userRounds = userRounds === '' ? '第 4 轮第 1 场' : userRounds + '、第 4 轮-第 1 场'
        }
        if(rounds > 3 && rank < finalUser * 0.6 + spacingCount + 1) {
            userRounds = userRounds === '' ? `${finalUser * 0.6 + spacingCount + 1}-${finalUser}名挑战区` : userRounds + `、${finalUser * 0.6 + spacingCount + 1}-${finalUser}名挑战区`
            showMessage = '你的答题已经结束'
        }

        if(rounds > 6) {
            showMessage = '比赛已经结束'
        }
        const msg = {
            'event': 'pushCurrentFinalInfo',
            'message': {
                finalRounds: rounds,
                penRoundsNumber,  // 当前所在题目
                rank: finaUser.rank,
                userRounds,
                showMessage
            }
        }
        //global.ws.send('', JSON.stringify(msg), finaUser.userId)
        global.redisClientPub.publish('newInfo', JSON.stringify({
                roomId: '', msg: msg, uid: finaUser.userId, cId: cid
            }
        ))
    }
}

/**
 * 解密方法
 * @param key      解密的key
 * @param iv       向量
 * @param cryptContent  密文
 * @returns string
 */
const decrypt = (cryptContent) => {
    cryptContent = Buffer.from(cryptContent, 'base64').toString('binary');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let decoded = decipher.update(cryptContent, 'binary', 'utf8');
    decoded += decipher.final('utf8');
    return JSON.parse(decoded);
};
/**
 * 加密方法
 * @param key 加密key
 * @param iv       向量
 * @param data     需要加密的数据
 * @returns string
 */
const encrypt = (data) => {
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    let cryptContent = cipher.update(data, 'utf8', 'binary');
    cryptContent += cipher.final('binary');
    cryptContent = Buffer.from(cryptContent, 'binary').toString('base64');
    return cryptContent;
};

/**
 * 获取ip
 * @returns {string}
 */
function getIPAddress() {
    const interfaces = require('os').networkInterfaces();
    for(const devName in interfaces) {
        const iFace = interfaces[devName];
        for(let i = 0; i < iFace.length; i++) {
            const alias = iFace[i];
            if(alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
}


module.exports = {
    /**
     *分页结构分装
     * @param pageNum
     * @param pageSize
     */
    pager({pageNum = 1, pageSize = 10}) {
        pageNum *= 1
        pageSize *= 1
        const skipIndex = (pageNum - 1) * pageSize
        return {
            page: {
                pageNum, pageSize
            }, skipIndex
        }
    },
    success(data = '', msg = '', code = CODE.SUCCESS) {
        log4j.debug(data)
        return {
            code, msg, data
        }
    },
    fail(msg = '', code = CODE.BUSINESS_ERROR) {
        log4j.error(msg)
        return {
            code, msg
        }
    }, // 组装树形菜单
    getTreeMenu(rootList, id, list) {
        for(let i = 0; i < rootList.length; i++) {
            const item = rootList[i]
            if(String(item.parentId.slice().pop()) === String(id)) {
                list.push(item._doc)
            }
        }
        list.forEach(item => {
            item.children = []
            this.getTreeMenu(rootList, item._id, item.children)
            if(item.children.length === 0) {
                delete item.children
            } else if(item.children.length > 0 && item.children[0].menuType === 2) {
                item.action = item.children
            }
        })

        return list
    },
    getJWTPayload,
    CODE,
    pushPen,
    startMatch,
    matchUserInfo,
    decrypt,
    encrypt,
    noteRoomLog,
    answerInfo,
    canGoFinal,
    pushFinalInfo,
    pushCurrentFinalInfo,
    getIPAddress,
    setRoomUserStatus,
    pushFinalPen,
    setUserAction,
    competitionOver,
    userRank,
    assignPen
}
