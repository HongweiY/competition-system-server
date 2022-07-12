const Koa = require('koa')
const app = new Koa()
const views = require('koa-views')
const json = require('koa-json')
const koaBody=require('koa-body')
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
/**
 * Create Socket server.
 */

const ws = new WebSocketServer()

ws.init()
global.ws = ws

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
        maxFileSize: 400*1024*1024,	// 设置上传文件大小最大限制，默认2M
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
            /^\/api\/compete\/delete/ ,
            /^\/api\/compete\/show/
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

module.exports = app
