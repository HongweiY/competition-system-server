/**
 * 数据库连接
 */

const config = require('./index')
const mongoose = require('mongoose')
const log4js = require('../utils/log4j')

const options = {
    autoIndex: false, // Don't build indexes
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    family: 4,// Use IPv4, skip trying IPv6
}

mongoose.connect(config.URL, options).then(
    () => {
        log4js.info('***连接成功***')
    },
    err => {

        log4js.error(`***连接失败${err}****`)
    }
)
