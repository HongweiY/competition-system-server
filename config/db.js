/**
 * 数据库连接
 */

const config = require('./index')
const mongoose = require('mongoose')
const log4js = require('../utils/log4j')

const options = {

}

mongoose.connect(config.URL, options).then(
    () => {
        log4js.info('***连接成功***')
    },
    err => {

        log4js.error(`***连接失败${err}****`)
    }
)
