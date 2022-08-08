const WebSocket = require('ws')
const {getJWTPayload, pushPen} = require('../utils/util')
const Match = require("../models/matchSchema");
const Compete = require('../models/competeSchema')
const Score = require("../models/scoreSchema");
const User = require("../models/userSchema");
const FinalUser = require("../models/finalUserSchema")
const FinalPenLog = require("../models/finalPenLogSchema")
const Pen = require("../models/penSchema");
const RoomLog = require("../models/roomLogSchema");
const dayjs = require("dayjs");
const util = require("../utils/util");
const mongoose = require("mongoose");
const Schedule = require("../utils/schedule");

class ws {
    constructor(config = {}) {
        const defaultConfig = {
            port: 9999, timeInterval: 5 * 1000, isAuth: true
        }
        // 最终配置
        const finalConfig = {...defaultConfig, ...config}
        this.wss = {}
        this.timeInterval = finalConfig.timeInterval
        this.isAuth = finalConfig.isAuth
        this.port = finalConfig.port
        this.options = config.options || {}
    }

    // 初始化webscoekt服务
    init(server) {
        this.wss = new WebSocket.Server({server})
        // 连接信息
        this.wss.on('connection', (ws) => {
            // 连接上之后随即发送一次心跳检测
            ws.isAlive = true
            ws.send(JSON.stringify({
                event: 'heartbeat', message: 'ping'
            }))
            ws.on('message', (msg) => this.onMessage(ws, msg))
            ws.on('close', () => this.onClose(ws))
        })

        // 心跳检测
        this.heartbeat()
    }

    onMessage(ws, msg) {
        // 用户鉴权 -> token -> _id
        // 心跳检测
        // 消息发送
        const msgObj = JSON.parse(msg)
        let roomId = msgObj.roomId
        const events = {
            auth: async() => {
                try {
                    const obj = await getJWTPayload(msgObj.message)
                    if(obj) {
                        const userInfo = obj.userInfo
                        ws.isAuth = true
                        ws._id = userInfo._id
                        ws.userId = msgObj.userId
                        ws.cId = msgObj.cId
                        const status = await global.redisClient.get(userInfo._id)
                        if(status === 'leave') {
                            if(userInfo._id) {
                                await global.redisClient.set(userInfo._id, "ready")
                            }
                        }
                    }
                } catch(error) {
                    ws.send(JSON.stringify({
                        event: 'noauth', message: 'please auth again'
                    }))
                }
            },
            heartbeat: () => {
                if(msgObj.message === 'pong') {
                    ws.isAlive = true
                }
            },
            matchRoom: async() => {
                ws.roomId = roomId
                ws.userId = msgObj.userId
                const matchUserInfo = await Match.findById(roomId).populate(['userOneId', 'userTwoId', 'userThreeId', 'userFourId',]).exec()
                if(matchUserInfo['type'] !== 'must') {
                    if(matchUserInfo.userOneId) {
                        const score = await Score.findOne({
                            competeId: matchUserInfo.cid,
                            userId: matchUserInfo.userOneId._id
                        })
                        if(score) {
                            matchUserInfo.userOneId.__v = score.score
                            matchUserInfo.userOneId.img = score.answer_time
                            // matchUserInfo.userOneId.push({test:12})
                        } else {
                            matchUserInfo.userOneId.__v = 0
                            matchUserInfo.userOneId.img = 0
                        }
                    }
                    if(matchUserInfo.userTwoId) {
                        const score = await Score.findOne({
                            competeId: matchUserInfo.cid,
                            userId: matchUserInfo.userTwoId._id
                        })
                        if(score) {
                            matchUserInfo.userTwoId.__v = score.score
                            matchUserInfo.userOneId.img = score.answer_time
                        } else {
                            matchUserInfo.userTwoId.__v = 0
                            matchUserInfo.userOneId.img = 0
                        }
                    }
                    if(matchUserInfo.userThreeId) {
                        const score = await Score.findOne({
                            competeId: matchUserInfo.cid,
                            userId: matchUserInfo.userThreeId._id
                        })
                        if(score) {
                            matchUserInfo.userThreeId.__v = score.score
                            matchUserInfo.userOneId.img = score.answer_time
                        } else {
                            matchUserInfo.userThreeId.__v = 0
                            matchUserInfo.userOneId.img = 0
                        }
                    }
                    if(matchUserInfo.userFourId) {
                        const score = await Score.findOne({
                            competeId: matchUserInfo.cid,
                            userId: matchUserInfo.userFourId._id
                        })
                        if(score) {
                            matchUserInfo.userFourId.__v = score.score
                            matchUserInfo.userOneId.img = score.answer_time
                        } else {
                            matchUserInfo.userFourId.__v = 0
                            matchUserInfo.userOneId.img = 0
                        }
                    }
                }

                const msg = {
                    'event': 'matchRoom', 'message': matchUserInfo
                }

                // if(matchUserInfo['type'] === 'must' && matchUserInfo['userCount'] === 4) {
                //     await pushPen(roomId, matchUserInfo['cid'], 'end', msgObj.userId)
                // }
                // if(matchUserInfo['type'] === 'disuse' && matchUserInfo['userCount'] === 2) {
                //     await pushPen(roomId, matchUserInfo['cid'], 'end', msgObj.userId)
                // }

                if(msgObj.type === 'start') {
                    await pushPen(roomId, matchUserInfo['cid'], 'start', 'all')
                    global.redisClientPub.publish('newInfo', JSON.stringify({
                            roomId, msg, uid: 'all', cId: matchUserInfo.cid
                        }
                    ))
                } else {
                    await pushPen(roomId, matchUserInfo['cid'], 'end', msgObj.userId)
                    global.redisClientPub.publish('newInfo', JSON.stringify({
                            roomId, msg, uid: msgObj.userId, cId: matchUserInfo.cid
                        }
                    ))
                }


            },

            changeCompeteType: async() => {
                const cId = msgObj.message.cId
                const currentType = msgObj.message.currentType
                const userId = msgObj.message.userId
                //查询状态是否已经改变
                const competeInfo = await Compete.findOne({cId, currentType}).exec()
                if(!competeInfo) {
                    const newCompeteInfo = await Compete.findOneAndUpdate({cId}, {currentType})
                    if(currentType === 'final') {
                        //进入终极排位赛，将所有有资格用户添加到
                        //判断用户信息是否已经写到系统

                        const allFinalUser = await Score.find({competeId: cId}).sort({score: -1}).limit(newCompeteInfo.finalUser).populate(['userId']).exec()
                        //将这100人写到新表格
                        //如果是终极排位赛，
                        //第31-65名选手，共35名选手参加第一轮终极排位赛，
                        //第11-35名选手，共25名选手参加第二轮终极排位赛
                        //第1-15名选手，共15名选手参加第三轮终极排位赛
                        //第66-100名选手，依次向上挑战
                        //第30挑战31
                        //第11

                        //生成题目写入系统，等用户请求后直接分发题目
                        let finalPen = await FinalPenLog.findOne({
                            cid: cId,//竞赛id
                            round: 1,//轮数
                            penNumber: 1//第几题
                        })

                        if(!finalPen) {
                            const penInfo = await Pen.aggregate().sample(1)
                            await FinalPenLog.create({
                                cid: cId,//竞赛id
                                round: 1,//轮数
                                penId: penInfo[0].penId, penInfo: penInfo[0],//题目
                                penNumber: 1,//第几题,
                                pushTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
                            })
                        }


                        let rank = 1
                        for(const finalUser of allFinalUser) {

                            const isExit = await FinalUser.findOne({
                                userId: finalUser.userId.userId,
                                cid: cId,//竞赛id
                            })
                            if(!isExit) {
                                await FinalUser.create({
                                    userId: finalUser.userId.userId,
                                    username: finalUser.userId.username,
                                    city: finalUser.userId.city,
                                    depart: finalUser.userId.depart,
                                    phone: finalUser.userId.phone,
                                    img: finalUser.userId.img,
                                    cid: cId,//竞赛id
                                    rank: rank,//排名
                                })
                                rank++
                                newCompeteInfo.currentType = currentType

                                const msg = {
                                    'event': 'finalCompetition',
                                    'message': {
                                        newCompeteInfo,
                                        finalInfo: {
                                            finalRound: 1,//开始第一轮，
                                            showMessage: `恭喜你以第${rank}名进入终极排位赛。期间请不要离开，随时等待题目推送`,
                                            rank,
                                        }
                                    }
                                }
                                global.redisClientPub.publish('newInfo', JSON.stringify({
                                        roomId: '', msg, uid: finalUser.userId.userId, cId
                                    }
                                ))
                            }

                        }
                        const taskStartTime = dayjs().add(30, 'second')
                        const second = taskStartTime.get('second')
                        const minute = taskStartTime.get('minute')
                        const hour = taskStartTime.get('hour')
                        const date = taskStartTime.get('date')
                        const month = taskStartTime.get('month')
                        const schedule = new Schedule({
                            unit_name: '自动题目切换',
                            maintain_time: `${second} ${minute} ${hour} ${date} ${month + 1} *`, //2016年的1月1日1点1分30秒触发
                            last_alarm: '自动题目切换'
                        }).create(async() => {
                           await util.pushFinalPen(cId)
                        })

                    } else {
                        newCompeteInfo.currentType = currentType
                        const msg = {
                            'event': 'changeCompeteType', 'message': newCompeteInfo
                        }
                        global.redisClientPub.publish('newInfo', JSON.stringify({
                                roomId: '', msg, uid: 'all', cId
                            }
                        ))
                    }
                } else {
                    const msg = {
                        'event': 'changeCompeteType', 'message': competeInfo
                    }
                    global.redisClientPub.publish('newInfo', JSON.stringify({
                            roomId: '', msg, uid: userId, cId
                        }
                    ))
                }

            },
            setUserState: async() => {
                const {uId} = msgObj.message
                await global.redisClient.set(uId, "ready");

            },
            getAllRank: async() => {

                const {cId, userId, uid, page = 1, page_size = 20} = msgObj.message
                //查询状态是否已经改变
                const {myRank, currentRankInfo} = await util.userRank(cId, uid)
                const skipIndex = (page - 1) * page_size

                const competitionInfo = await Compete.findOne({cId: cId}).exec()
                const currentType = competitionInfo['currentType']

                let returnData = []
                let total = 0
                if(currentType === 'final') {
                    let sort = {
                        rank: 1,
                    }
                    let list = await FinalUser.find({cId}, {}, {
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
                    const list = await Score.find({competeId: cId}, {}, {
                        skip: skipIndex, limit: page_size, sort: sort
                    }).populate(['userId']).exec()
                    total = await Score.countDocuments({competeId: cId})

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


                const msg = {
                    'event': 'userAllRank',
                    'message': {
                        list: returnData,
                        total,
                        currentRank: myRank,
                        currentRankInfo
                    }
                }
                global.redisClientPub.publish('newInfo', JSON.stringify({
                        roomId: '', msg, uid: userId, cId
                    }
                ))
            },

            getUserRank: async() => {
                const cId = msgObj.message.cId
                const userId = msgObj.message.userId
                const uid = msgObj.message.uid

                const {myRank, currentRankInfo} = await util.userRank(cId, uid)

                //查询状态是否已经改变
                const msg = {
                    'event': 'userRank', 'message': myRank
                }
                global.redisClientPub.publish('newInfo', JSON.stringify({
                        roomId: '', msg, uid: userId, cId
                    }
                ))

            },
            message: () => {

                // 鉴权拦截
                // if (!ws.isAuth && this.isAuth) {
                //   return
                // }
                // 消息广播
                // this.wss.clients.forEach((client) => {
                //   if (client.readyState === WebSocket.OPEN && client._id === ws._id) {
                //     this.send(msg)
                //   }
                // })
            }
        }

        events[msgObj.event]()
    }

    // 房间匹配答题，信息推送 题目推送

    send(roomID, msg, uid = 'all', cId = '') {
        if(roomID) {
            if(uid === 'all') {
                this.wss.clients.forEach((client) => {
                    if(client.readyState === WebSocket.OPEN && client.roomId === roomID && client.cId === cId) {
                        client.send(msg)
                    }
                })
            } else {
                this.wss.clients.forEach((client) => {
                    if(client.readyState === WebSocket.OPEN && client.userId === uid && client.cId === cId) {
                        client.send(msg)
                    }
                })
            }
        } else {
            if(uid === 'all') {
                this.wss.clients.forEach((client) => {
                    if(client.readyState === WebSocket.OPEN && client.cId === cId) {
                        client.send(msg)
                    }
                })
            } else {
                this.wss.clients.forEach((client) => {
                    if(client.readyState === WebSocket.OPEN && client.userId === uid && client.cId === cId) {
                        client.send(msg)
                    }
                })
            }
        }
    }

    // 推送系统的消息，如比赛模式切换等
    broadcast(msg) {
        this.wss.clients.forEach((client) => {
            if(client.readyState === WebSocket.OPEN) {
                client.send(msg)
            }
        })
    }

    async onClose(ws) {
        const userInfo = await User.findOne({userId: ws.userId})
        if(ws.cId == 1 || ws.cId == 2) {
            await Score.deleteMany({competeId: ws.cId, userId: userInfo._id})

            await RoomLog.deleteMany({cId: ws.cId, uid: ws.userId})
        }
        if(userInfo && userInfo._id) {
            await global.redisClient.set(userInfo._id, 'leave')
        }

    }

    // 心跳检测
    heartbeat() {
        clearInterval(this.interval)
        this.interval = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if(!ws.isAlive) {
                    return ws.terminate()
                }
                // 主动发送心跳检测请求
                // 当客户端返回了消息之后，主动设置flag为在线
                ws.isAlive = false
                ws.send(JSON.stringify({
                    event: 'heartbeat', message: 'ping'
                }))
            })
        }, this.timeInterval)
    }
}


module.exports = ws