const Koa = require('koa')
const app = new Koa()
const views = require('koa-views')
const json = require('koa-json')
const koaBody = require('koa-body')
const onerror = require('koa-onerror')
// const bodyparser = require('koa-bodyparser')
const logger = require('koa-logger')
const log4js = require('./utils/log4j')
const router = require('koa-router')()
const koaJwt = require('koa-jwt')
const util = require('./utils/util')
const users = require('./routes/users')
const menus = require('./routes/menus')
const roles = require('./routes/roles')
const dept = require('./routes/dept')
const score = require('./routes/score')
const competes = require('./routes/competes')
const pens = require('./routes/pens')
const WebSocketServer = require('./wss/websocket')
const debug = require('debug')('demo:server');
const http = require('http');

const port = normalizePort(process.env.PORT || '9000');

function normalizePort(val) {
    const port = parseInt(val, 10);

    if(isNaN(port)) {
        // named pipe
        return val;
    }

    if(port >= 0) {
        // port number
        return port;
    }

    return false;
}


// error handler
onerror(app)
require('./config/db')
const path = require('path')
// middlewares
// app.use(bodyparser({
//     enableTypes: ['json', 'form', 'text']
// }))
app.use(json())
app.use(logger())

app.use(require('koa-static')(path.join(__dirname, '/public')))

app.use(views(path.join(__dirname, '/views'), {
    extension: 'pug'
}))

app.use(koaBody({
    multipart: true,
    formidable: {
        maxFileSize: 400 * 1024 * 1024,	// 设置上传文件大小最大限制，默认2M
        uploadDir: 'public/uploads/',
        keepExtensions: true, // 保持文件的后缀
    }
}));
// logger
app.use(async(ctx, next) => {
    log4js.info(`${ctx.method} params:${ctx.method === 'GET' ? JSON.stringify(ctx.request.query) : JSON.stringify(ctx.request.body)}`)
    await next().catch((err) => {
        if(err.status === 401) {
            ctx.status = 200
            ctx.body = util.fail('Token 认证失败', util.CODE.AUTH_ERROR)
        } else {
            throw err
        }
    })
})
// token 验证
app.use(koaJwt({secret: 'ymfsder'}).unless(
    {
        path: [
            /^\/api\/users\/login/,
            /^\/api\/compete\/create/,
            /^\/api\/compete\/userAdd/,
            /^\/api\/compete\/delete/,
            /^\/api\/compete\/show/,
            /^\/api\/compete\/test/
        ]
    }
))

// routes
router.prefix('/api')

router.use(users.routes(), users.allowedMethods())
router.use(roles.routes(), roles.allowedMethods())
router.use(menus.routes(), menus.allowedMethods())
router.use(dept.routes(), dept.allowedMethods())
router.use(score.routes(), score.allowedMethods())
router.use(competes.routes(), competes.allowedMethods())
router.use(pens.routes(), pens.allowedMethods())

app.use(router.routes(), router.allowedMethods())


// error-handling
app.on('error', (err, ctx) => {
    console.error('server error', err, ctx)
})

const server = http.createServer(app.callback());

server.listen(port)

/**
 * Create Socket server.
 */

const ws = new WebSocketServer()
ws.init(server)
global.ws = ws

const Redis = require('ioredis');

// redis消息分发
// const redisClientPub = new Redis({
//     port: 6379, // Redis port
//     host: "10.206.0.17", // Redis host
//     username: "bmj", // needs Redis >= 6
//     password: "bmj123456redis",
//     db: 0, // Defaults to 0
// });
// const redisClientSub = new Redis({
//     port: 6379, // Redis port
//     host: "10.206.0.17", // Redis host
//     username: "default", // needs Redis >= 6
//     password: "Bmj@12345@redis",
//     db: 0, // Defaults to 0
// });
//
// const redisClient = new Redis({
//     port: 6379, // Redis port
//     host: "10.206.0.17", // Redis host
//     username: "default", // needs Redis >= 6
//     password: "Bmj@12345@redis",
//     db: 0, // Defaults to 0
// });

const redisClientPub = new Redis({
    port: 6379, // Redis port
    host: "127.0.0.1", // Redis host
    db: 0, // Defaults to 0
});
const redisClientSub = new Redis({
    port: 6379, // Redis port
    host: "127.0.0.1", // Redis host
    db: 0, // Defaults to 0
});
const redisClient = new Redis({
    port: 6379, // Redis port
    host: "127.0.0.1", // Redis host
    db: 0, // Defaults to 0
});

redisClientSub.subscribe('newInfo')

redisClientSub.on("message", function(channel, message) {
    //往对应房间广播消息
    const {roomId, msg, uid} = JSON.parse(message)
    global.ws.send(roomId, JSON.stringify(msg), uid)


});


global.redisClientPub = redisClientPub
global.redisClient = redisClient
