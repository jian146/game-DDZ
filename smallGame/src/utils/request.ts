import { extend } from 'umi-request';
import { RequestOptionsInit } from 'umi-request/types/index';
import { notification } from 'antd';

const codeMessage: any = {
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
  };
  /**
 * 异常处理程序
 */
const errorHandler = (error: { response: Response }): Response => {
    const { response } = error;
    if (response && response.status) {
      const errorText = codeMessage[response.status] || response.statusText;
      const { status, url } = response;
      // token校验失败
      if (status == 401 || status == 402 || status == 403) {
        // storage.setString('token', '');
        // storage.setString('tokenST', '');
        // history.replace(loginPath);
      }else if (status >= 500) {
        notification.error({
          message: '服务器异常',
          description: `${errorText}`
        });
        console.error(`服务器异常${status}:${url}`);
      }else {
        notification.error({
          message: '状态异常',
          description: `${errorText}`
        });
        console.error(`状态异常${status}:${url}`);
      }
    } else if (!response) {
      notification.info({
        message: '网络错误',
        description: '您的网络发生异常，无法连接服务器',
      });
    }
    return response;
  };
  interface RequestProp {
    url: string;
    options?: RequestOptionsInit;
    withToken?: boolean;
  }
  
  const newRequest = async ({
    url = '',
    options = {},
    withToken = true,
  }: RequestProp) => {
    const request = extend({
      errorHandler, // 默认错误处理
      headers: {
        // token: `${withToken && getToken() ? getToken() : ''}`,
      },
      credentials: 'include', // 默认请求是否带上cookie
    });
    const res = await request(url, options);
    if (!res) return null;
    return res;
  };
  export default newRequest;