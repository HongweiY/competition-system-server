const WebSocket = require('ws')
const {getJWTPayload, pushPen} = require('../utils/util')
const Match = require("../models/matchSchema");
const Compete = require('../models/competeSchema')
const Score = require("../models/scoreSchema");
const FinalUser = require("../models/finalUserSchema")
const FinalPenLog = require("../models/finalPenLogSchema")
const Pen = require("../models/penSchema");

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
    init() {
        this.wss = new WebSocket.Server({port: this.port, ...this.options})
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
                        ws.isAuth = true
                        ws._id = obj._id
                        ws.userId = msgObj.userId
                        ws.send(JSON.stringify({
                            event: 'message', message: ''
                        }))
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
                const msg = {
                    'event': 'matchRoom', 'message': matchUserInfo
                }
                this.wss.clients.forEach((client) => {
                    if(client.readyState === WebSocket.OPEN && client.roomId === roomId) {
                        client.send(JSON.stringify(msg))
                    }
                })
                if(matchUserInfo['type'] === 'must' & matchUserInfo['userCount'] === 4) {
                    await pushPen(roomId, matchUserInfo['cid'], 'start', msgObj.userId)
                }
                if(matchUserInfo['type'] === 'disuse' & matchUserInfo['userCount'] === 2) {
                    await pushPen(roomId, matchUserInfo['cid'], 'start', msgObj.userId)
                }

            },
            changeCompeteType: async() => {
                const cId = msgObj.message.cId
                const currentType = msgObj.message.currentType
                //查询状态是否已经改变
                const competeInfo = await Compete.findOne({cId, currentType}).exec()
                if(!competeInfo) {
                    const newCompeteInfo = await Compete.findOneAndUpdate({cId}, {currentType})
                    if(currentType === 'final') {
                        //进入终极排位赛，将所有有资格用户添加到
                        //判断用户信息是否已经写到系统

                        const allFinalUser = await Score.find().sort({score: -1}).limit(100).populate(['userId']).exec()
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
                                penNumber: 1//第几题
                            })
                            if(allFinalUser) {
                                let rank = 1
                                for(const finalUser of allFinalUser) {
                                    const isExit = await FinalUser.findOne({
                                        userId: finalUser.userId.userId,
                                        username: finalUser.userId.username,
                                        city: finalUser.userId.city,
                                        depart: finalUser.userId.depart,
                                        phone: finalUser.userId.phone,
                                        img: finalUser.userId.img,
                                        cid: cId,//竞赛id
                                        rank: rank,//排名
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
                                        //向所有资格的用户发送消息
                                        this.wss.clients.forEach((client) => {
                                            console.log(client.userId)
                                            if(client.readyState === WebSocket.OPEN && client.userId === finalUser.userId.userId) {
                                                client.send(JSON.stringify({
                                                    event: 'finalCompetition', newCompeteInfo, finalInfo: {
                                                        finalRound: 1,//开始第一轮，
                                                        showMessage: `恭喜你以第${rank}名进入终极排位赛。期间请不要离开，随时等待题目推送`,
                                                        rank,

                                                    }
                                                }))
                                            }

                                        })
                                    }

                                }
                            }
                        }

                    } else {
                        newCompeteInfo.currentType = currentType
                        this.wss.clients.forEach((ws) => {
                            ws.send(JSON.stringify({
                                event: 'changeCompeteType', message: newCompeteInfo
                            }))
                        })
                    }


                }

            }, message: () => {

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
        // console.log(msgObj.event)
        events[msgObj.event]()
    }

    // 房间匹配答题，信息推送 题目推送
    send(roomID, msg, uid) {
        if(roomID) {
            if(uid = 'all') {
                this.wss.clients.forEach((client) => {
                    if(client.readyState === WebSocket.OPEN && client.roomId === roomID) {
                        client.send(msg)
                    }
                })
            } else {
                this.wss.clients.forEach((client) => {
                    if(client.readyState === WebSocket.OPEN && client.roomId === roomID && client.userId === uid) {
                        client.send(msg)
                    }
                })
            }
        } else {
            this.wss.clients.forEach((client) => {
                if(client.readyState === WebSocket.OPEN && client.userId === uid) {
                    client.send(msg)
                }
            })
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

    onClose(ws) {

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