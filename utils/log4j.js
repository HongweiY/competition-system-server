/**
 *封装log4j
 */
const log4js = require('log4js')

const levels = {
    trace: log4js.levels.TRACE,
    debug: log4js.levels.DEBUG,
    info: log4js.levels.INFO,
    warn: log4js.levels.WARN,
    error: log4js.levels.ERROR,
    fatal: log4js.levels.FATAL
}

log4js.configure({
    appenders: {
        console: {
            type: 'console'
        },
        info: {
            type: 'file', filename: 'logs/all-the-logs.log'
        },
        error: {
            type: 'dateFile', filename: 'logs/log', pattern: 'yyyy-MM-dd.log', alwaysIncludePattern: true

        }
    },
    categories: {
        default: {
            appenders: ['console'], level: 'debug'
        },
        info: {
            appenders: ['console', 'info'], level: 'info'
        },
        error: {
            appenders: ['console', 'error'], level: 'error'
        }

    }
})

/**
 * debug信息输出
 * @param content
 */
exports.debug = (content) => {
    const logger = log4js.getLogger('debug')
    logger.level = levels.debug
    logger.debug(content)
}

/**
 * info 信息输出
 * @param content
 */
exports.info = (content) => {
    const logger = log4js.getLogger('info')
    logger.level = levels.info
    logger.info(content)
}
/**
 * warn 信息输出
 * @param content
 */
exports.warn = (content) => {
    const logger = log4js.getLogger('warn')
    logger.level = levels.warn
    logger.warn(content)
}
/**
 * error 信息输出
 * @param content
 */
exports.error = (content) => {
    const logger = log4js.getLogger('error')
    logger.level = levels.error
    logger.error(content)
}
