/**
 * 用户管理模块
 *
 */
const router = require('koa-router')()
const Pen = require('../models/penSchema')
const path = require('path')
const Counter = require('../models/counterSchema')
const {utils, readFile} = require('xlsx');
const jwt = require("jsonwebtoken");
const util = require("../utils/util");
const User = require("../models/userSchema");
const downPath = path.resolve(__dirname, '../../public/uploads');

router.prefix('/pens')


router.post('/import', async(ctx) => {

        const file = ctx.request.files.file.filepath; // 获取上传文件
        const workbook = readFile(file);
        let dataList = []; // 存储获取到的数据
        for(const sheet in workbook.Sheets) {
            if(workbook.Sheets.hasOwnProperty(sheet)) {
                dataList = dataList.concat(
                    utils.sheet_to_json(workbook.Sheets[sheet])
                );
                break; // 如果只取第一张表，就取消注释这行
            }
        }
        let counterDoc = await Counter.findOneAndUpdate({_id: 'penId'}, {$inc: {sequenceValue: 1}}, {new: true})
        let insertData = []
        const chooseOptions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
        let penId = counterDoc.sequenceValue
        for(const data of dataList) {
            let answer = ''
            if(data['试题类型'] === '多选') {
                const answerArr = data['答案'].toString().split(',')
                for(const strings of answerArr) {
                    answer = answer ? answer + ',' + chooseOptions[strings] : chooseOptions[strings]
                }
            } else {
                answer = chooseOptions[data['答案'] - 1]
            }

            let option = []
            if(data['试题类型'] === '判断') {
                option.push(data['选项1'])
                option.push(data['选项2'])
            } else {
                for(let i = 1; i < 10; i++) {
                    if(typeof data[`选项${i}`] !== "undefined") {
                        option.push(chooseOptions[i - 1] + '、' + data[`选项${i}`])
                    }
                }
            }

            insertData = insertData.concat({
                penId: penId,
                stem: data['题目内容'],
                penType: data['试题类型'],
                isRandom: data['是否随机'] == '是' ? true : false,
                answer: answer,
                options: option,
                author: data['出题者单位'] ? `${data['出题者单位']}-${data['出题者姓名']}` : ''

            })
            penId++

        }

        const res = await Pen.create(insertData)
        await Counter.updateOne({_id: 'penId'}, {sequenceValue: penId})
        if(res) {
            ctx.body = util.success({}, `成功导入${insertData.length}成功数据`)
        } else {
            ctx.body = util.fail('账号密码不正确')
        }


    }
)

router.get('/list', async(ctx) => {
    const {penTitle, type} = ctx.request.query
    const {page, skipIndex} = util.pager(ctx.request.query)
    const params = {}
    if(penTitle) {
        params.stem = {
            $regex: penTitle, $options: 'i'
        }
    }
    if(type) {
        params.penType = {
            $eq: type
        }
    }

    try {
        const list = await Pen.find(params, {}, {skip: skipIndex, limit: page.pageSize}).exec()
        const total = await Pen.countDocuments(params)
        ctx.body = util.success({
            page: {
                ...page, total
            },
            list
        })
    } catch(e) {
        ctx.body = util.fail(`查询异常${e.stack}`)
    }
})

router.post('/delete', async(ctx) => {
    const {ids} = ctx.request.body
    const res = await Pen.deleteMany({_id: {$in: ids}}, {state: 2})
    if(res) {
        ctx.body = util.success(res, `共删除${res.matchedCount}条`)
        return
    }
    ctx.body = util.fail('删除失败')
})

module.exports = router
