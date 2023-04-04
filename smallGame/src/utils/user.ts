import storage from "./storage";
export interface I_User{
    userName:string;
    createTime:number;
    isLogin:boolean;
}
  /**
   * 检查用户是否注册了
   */
   export const getUserInfo = ():I_User => {
    const user:I_User = storage.getObject('DDZ_User');
    return {
        ...user,
        isLogin:user&& user.userName?true:false
        
    }

  };
  export const setUserInfo=(userName:string)=>{
    const userInfo:I_User={
      userName,
      isLogin:true,
      createTime:new Date().getTime()
    }
    storage.setObject('DDZ_User',userInfo)
  }