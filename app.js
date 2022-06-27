const Koa = require('koa')
const app = new Koa()
const views = require('koa-views')
const json = require('koa-json')
// const koaBody=require('koa-body')
const onerror = require('koa-onerror')
const bodyparser = require('koa-bodyparser')
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
app.use(bodyparser({
    enableTypes: ['json', 'form', 'text']
}))
app.use(json())
app.use(logger())

app.use(require('koa-static')(path.join(__dirname, '/public')))

app.use(views(path.join(__dirname, '/views'), {
    extension: 'pug'
}))

// app.use(koaBody({
//     multipart: true,
//     formidable: {
//         maxFileSize: 400*1024*1024,	// 设置上传文件大小最大限制，默认2M
//         uploadDir: 'public/uploads/',
//         keepExtensions: true, // 保持文件的后缀
//     }
// }));
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
//加密解码

// =========
// http://localhost:8000/#/?cid=3&token=drptwwA3mPv97xDg6bL9+CDZ+OdXqJ6vrmYNRoRKRIGNVDuloFc3IHQ5iiTdqeDw2hu8OnkrVL/Lf7kScIVdduo12GT+M/nwN25MSu8W7ZZf6SE70or05m7beaWSUIVowPwLS0hSqrgc1uoX7psp1d5QSvznsolzwH8b4d9d1ddEdCw4URkLl6s1VpLABmf7
// =========
// =========
// http://localhost:8000/#/?cid=3&token=txjJ7BygaT40y7esIJzQ6B11go680GGdYtcJmx9zhFa0gM8GSdYETWNe4IN3Qbv5C+x4RMAjFUnT1dfk/SPUPJHZbnEgkCxvHJA4E0L21uplAS9ovqhmlBA2a2ngKisimkkre5+YtN5jIAJO3dF0ZAKmKavbZM9ZMGP+tYAVPTEoTvCrxdbZ51iA9wQ7lc1l
// =========
// =========
// http://localhost:8000/#/?cid=3&token=wPOLDOvRlvIAk9jlQsprsyYyfIY7ujyOl9Fi5IhWDwXz+SS8OyNu3ScT91UfaXuDwRiCZEV9Hm8tBPkdALrWJ+2eM2W6KXTXxjvLbY9obTkguo16CMFw9fSp3NnlDprpdd+d2zDcICXMuRVcoswQP19n3JS4MciWxAz6wtLG5U36TWR4ssHKVpP+ddp5MTV/
// =========
// =========
// http://localhost:8000/#/?cid=3&token=ojDpazYjYsideQSM1J0MZdFqS7Bwij3YB/0m5Sz257/P+/7Fs8D1cT811svlZ+tQ01v9q/sbgvGvTb9Ba2VGt+h2wgVy4N+y+1MoMEDC/dGnN3ck3VVXo+PgD3DDMaFemInINER5QqXNIS2BseWU6XKW5Jna+NDC2AB5xAbgIMVqyJLs7tAXR+JPnkixFaLY
// =========
// ax/ht2ECK1za9KkiWx4TRkPNaJC+a8zoNNMC4kSWzt1Zg2bdoC0uM8YofLgaZRSs46cz3Q5NGWdzZV1sFRBC9uP2hf5xFKtVWBwWmmHhbzwtSKZSdYxNmbW5jxagdyoy6kuVA/OuDwyIGmxI3GOI6SIUKl/145uCDes8bL3I+uR+5NcZ7xgii1OxsGTCAByZ
// =========
// MZxS93KRUZghlGGs8xy8Ikn2VrGnIswfbj8jxlLi6BNJPIBwdFT71UqBi8gif1fnBpGvEKC4au6Muqd410gErZySJIk0Se/79s73ynoTVcn4UQtUj6TaehhKclaePnW1WlMOQnpnCkLf7HZNHdAo5Av97GASHM0sbq6pug8DwKpsdV+A+dBg7foPOj3ktK+U
// =========




// error-handling
app.on('error', (err, ctx) => {
    console.error('server error', err, ctx)
})

module.exports = app
