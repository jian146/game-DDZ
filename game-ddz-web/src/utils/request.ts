import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { notification } from 'antd'

const codeMessage: Record<number, string> = {
  200: '服务器成功返回请求的数据。',
  201: '新建或修改数据成功。',
  202: '一个请求已经进入后台排队（异步任务）。',
  204: '删除数据成功。',
  400: '发出的请求有错误，服务器没有进行新建或修改数据的操作。',
  401: '用户没有权限（令牌、用户名、密码错误）。',
  403: '用户得到授权，但是访问是被禁止的。',
  404: '发出的请求针对的是不存在的记录，服务器没有进行操作。',
  406: '请求的格式不可得。',
  410: '请求的资源被永久删除，且不会再得到的。',
  422: '当创建一个对象时，发生一个验证错误。',
  500: '服务器发生错误，请检查服务器。',
  502: '网关错误。',
  503: '服务不可用，服务器暂时过载或维护。',
  504: '网关超时。',
}

/**
 * 异常处理程序
 */
const errorHandler = (error: AxiosError) => {
  const { response } = error

  if (response && response.status) {
    const errorText =
      codeMessage[response.status] || response.statusText || '请求错误'
    const { status, config } = response
    const url = config?.url ?? ''

    // token 校验失败
    if (status === 401 || status === 402 || status === 403) {
      // TODO: token 过期处理，例如跳登录
    } else if (status >= 500) {
      notification.error({
        message: '服务器异常',
        description: `${errorText}`,
      })
      console.error(`服务器异常${status}:${url}`)
    } else {
      notification.error({
        message: '状态异常',
        description: `${errorText}`,
      })
      console.error(`状态异常${status}:${url}`)
    }
  } else {
    notification.info({
      message: '网络错误',
      description: '您的网络发生异常，无法连接服务器',
    })
  }
}

interface RequestProp {
  url: string
  options?: AxiosRequestConfig
}

const newRequest = async ({
  url = '',
  options = {},
}: RequestProp) => {
  const instance = axios.create({
    withCredentials: true,
    headers: {
      // token: `${withToken && getToken() ? getToken() : ''}`,
      ...(options.headers || {}),
    },
  })

  try {
    const res = await instance.request({
      url,
      ...options,
    })
    // 兼容 umi-request：直接返回后端数据体
    return res.data
  } catch (e) {
    errorHandler(e as AxiosError)
    return null
  }
}

export default newRequest