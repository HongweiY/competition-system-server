### 1.koa2 获取参数的方法

1. post

```javascript
ctx.request.body

```

2. get

```javascripts
ctx.request.query

```

### mongoose 返回指定字段的方式

- 字符串

```javascript
  const res = await User.findOne ({
    username,
    userPwd
}, 'usrId userName userEmail state role deptId roleList')
```

- json

```javascript
 const res = await User.findOne ({
    username,
    userPwd
}, {userId: 1, username: 0})
```

- select

### mongoose报错：Cast to Object failed for value XXX (type string) at path \"$or.0\" for model xxx

出现该异常异常的原因主要是$or查询的时候需要接收对象，es6的中 key和value相同，只需要写一个语法不能使用

```javascript
//错误
const exitUser = await User.findOne ({$or: [userName, userEmail]}, '_id username userEmail')

//正确
const exitUser = await User.findOne ({$or: [{userName}, {userEmail}]}, '_id username userEmail')

```