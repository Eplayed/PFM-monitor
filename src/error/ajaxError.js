import Monitor from '../utils/monitor.js'
import {
    ErrorCategoryEnum,
    AjaxLibEnum,
    ErrorLevelEnum
} from '../utils/config.js'
import utils from '../utils/utils'

/**
 * ajax error异常
 */
class AjaxError {
    constructor(params) {
        this.params = params
    }
    /**
     * 处理错误
     * @param type {*} ajax库类型
     * @param error{*} 错误信息
     */
    handleError(type, error) {
        switch (type) {
            case AjaxLibEnum.AJAX:
                xhrError(this.params)
                break
            case AjaxLibEnum.FETCH:
                fetchError(this.params)
                break
            default:
                fetchError(this.params)
                xhrError(this.params)
                break
        }
    }
}

export default AjaxError

const fetchError = params => {
    if (!window.fetch) return
    let _oldFetch = window.fetch
    let data = {
        request: {
            method: 'GET'
        }
    }
    let _handleEvent = () => {
        try {
            data.level = ErrorLevelEnum.WARN
            data.category = ErrorCategoryEnum.AJAX_ERROR
            new Monitor(params).recordError(data)
        } catch (error) {
            console.log('监控fetch错误：', error)
        }
    }

    window.fetch = function () {
        const arg = arguments
        const args = Array.prototype.slice.apply(arg)
        if (!args || !args.length) return result
        if (args.length === 1) {
            if (typeof args[0] === 'string') {
                data.request.url = args[0]
            } else if (utils.isObject(args[0])) {
                data.request.url = args[0].url
                data.request.method = args[0].method || 'GET'
                data.request.params = JSON.parse(args[0].body) || {}
            }
        } else {
            data.request.url = args[0]
            data.request.method = args[1].method || 'GET'
            data.request.params = JSON.parse(args[1].body) || {}
        }
        return _oldFetch.apply(this, arguments)
            .then(res => {
                if (res.status !== 200) { // True if status is HTTP 2xx
                    // 上报错误
                    data.response = {
                        status: res.status,
                        responseText: res.statusText
                    }
                    data.msg = `${data.request.method} ${res.url} ${res.status} (${res.statusText})`
                    _handleEvent()
                }
                return res
            })
            .catch(error => {
                // 上报错误
                data.msg = error.stack || error
                _handleEvent()
                throw error
            })
    }
}


/**
 * 获取HTTP错误信息
 */
const xhrError = params => {

    /**
     * 获取错误信息
     */
    if (!window.XMLHttpRequest) {
        return
    }
    // 保存原生的 open 方法
    let xhrOpen = XMLHttpRequest.prototype.open
    // 保存原生的 send 方法
    let xhrSend = XMLHttpRequest.prototype.send
    let data = {
        request: {
            method: 'GET'
        }
    }
    let _handleEvent = (event, arg) => {
        try {
            if (event && event.currentTarget && event.currentTarget.status !== 200) {
                data.level = ErrorLevelEnum.WARN
                data.category = ErrorCategoryEnum.AJAX_ERROR
                data.msg = `${data.request.method} ${event.target.responseURL} ${event.target.status} (${event.target.statusText})`
                data.responseTime = event.timeStamp
                data.request.params = JSON.parse(arg[0]) || {}
                data.request.url = event.target.responseURL
                data.response = {
                    status: event.target.status,
                    responseText: event.target.responseText
                }
                new Monitor(params).recordError(data)
            }
        } catch (error) {
            console.log('监听XHR错误：', error)
        }
    }
    // 重写 open
    XMLHttpRequest.prototype.open = function () {
        // 先在此处取得请求的method
        data.request.method = arguments[0]
        // 再调用原生 open 实现重写
        return xhrOpen.apply(this, arguments)
    }
    // 重写 send
    XMLHttpRequest.prototype.send = function () {
        if (this['addEventListener']) {
            this['addEventListener']('error', e => _handleEvent(e, arguments)) // 失败
            this['addEventListener']('load', e => _handleEvent(e, arguments)) // 完成
            this['addEventListener']('abort', e => _handleEvent(e, arguments)) // 取消
        } else {
            let tempStateChange = this['onreadystatechange']
            this['onreadystatechange'] = function (event) {
                tempStateChange.apply(this, arguments)
                if (this.readyState === 4) {
                    _handleEvent(event, arguments)
                }
            }
        }
        // 再调用原生 send 实现重写
        return xhrSend.apply(this, arguments)
    }
}

/**
 * Axios类库 错误信息处理(如果不配置，可以统一通过XHR接受错误信息)
 */
// const axiosError = (params, error) => {
//     let data
//     if (error && error.config && error.config.url) {
//         data.url = error.config.url
//     }
//     data.level = ErrorLevelEnum.WARN
//     data.category = ErrorCategoryEnum.AJAX_ERROR
//     data.msg = JSON.stringify(error)
//     new Monitor(params).recordError(data)
// }

// axios重写
// function _Axios() {
//     let data = {
//         response: {},
//         request: {}
//     }
//     if (!window.axios) return;
//     const _axios = window.axios
//     const List = ['axios', 'request', 'get', 'delete', 'head', 'options', 'put', 'post', 'patch']
//     List.forEach(item => {
//         _reseat(item)
//     })

//     function _reseat(item) {
//         let _key = null;
//         if (item === 'axios') {
//             window['axios'] = resetFn;
//             _key = _axios
//         } else if (item === 'request') {
//             window['axios']['request'] = resetFn;
//             _key = _axios['request'];
//         } else {
//             window['axios'][item] = resetFn;
//             _key = _axios[item];
//         }

//         function resetFn() {
//             const result = ajaxArg(arguments, item)
//             return _key.apply(this, arguments)
//                 .then(function (res) {
//                     if (result.report === 'report-data') return res;
//                     try {
//                         data.request.url = res.request.responseURL ? res.request.responseURL.split('?')[0] : '';
//                         // data.request.responseText = res.request.responseText;
//                         data.request.method = result.method
//                         data.request.params = result.options
//                     } catch (e) {}
//                     return res
//                 })
//                 .catch((err) => {
//                     if (result.report === 'report-data') return res;
//                     data.msg = err.message
//                     data.response.status = err.response ? err.response.status : 0
//                     return err
//                 })
//         }
//     }
// }

// // Ajax arguments
// function ajaxArg(arg, item) {
//     let result = {
//         method: 'GET',
//         type: 'xmlhttprequest',
//         report: ''
//     }
//     let args = Array.prototype.slice.apply(arg)
//     try {
//         if (item == 'axios' || item == 'request') {
//             result.url = args[0].url
//             result.method = args[0].method
//             result.options = result.method.toLowerCase() == 'get' ? args[0].params : args[0].data
//         } else {
//             result.url = args[0]
//             result.method = ''
//             if (args[1]) {
//                 if (args[1].params) {
//                     result.method = 'GET'
//                     result.options = args[1].params;
//                 } else {
//                     result.method = 'POST'
//                     result.options = args[1];
//                 }
//             }
//         }
//         result.report = args[0].report
//     } catch (err) {}
//     return result;
// }