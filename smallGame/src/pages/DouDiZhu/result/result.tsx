import { Button } from 'antd';
import styles from './result.less';
interface I_Result {
  isSuccess?: boolean;
  position: number;
  onEndKeep:()=>void
}
const Result: React.FC<I_Result> = ({ isSuccess = true, position,onEndKeep=()=>{} }) => {
  const roleNameList = ['地主', '农民', '农民'];

  const currentName = roleNameList[position];

  return (
    <div className={styles.resultBox}>
      <div className={styles.mask} onClick={(e)=>{e.stopPropagation();}}></div>
      <div className={styles.results}>
        {isSuccess ? (
          <div className={styles.success}>{currentName}胜利</div>
        ) : (
          <div className={styles.fail}>{currentName}失败</div>
        )}
        <div>
          <Button onClick={onEndKeep}>继续</Button>
        </div>
      </div>
    </div>
  );
};
export default Result;
