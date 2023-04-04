import { T_decorStr } from '@/utils/card';
import { T_cardColor } from '@/utils/cartd';
import styles from './decor.less'
interface I_Decor {
  style?: React.HTMLAttributes<HTMLSpanElement>;
  className?: string;
  cardColor:T_cardColor
  point: number;
}
export const decorMap: {
  decor: T_decorStr;
  text: string;
  color: 'red' | 'black';
}[] = [
  {
    decor: 'spade',
    text: '♠︎',
    color: 'black',
  },
  {
    decor: 'heart',
    text: '♥︎',
    color: 'red',
  },
  {
    decor: 'plumBlossom',
    text: '♣︎',
    color: 'black',
  },
  {
    decor: 'block',
    text: '♦︎',
    color: 'red',
  },
];
const Decor: React.FC<I_Decor> = ({ style, className, cardColor, point }) => {
  const decorData = decorMap[cardColor];
  // const getPointDom = () => {
  //   let domStr = '';
  //   switch (point) {
  //     case 17:
  //     case 18:
  //       domStr = 'Joker';
  //       break;
  //     case 14:
  //       domStr = 'A';
  //       break;
  //     case 11:
  //       domStr = 'J';
  //       break;
  //     case 12:
  //       domStr = 'Q';
  //       break;
  //     case 13:
  //       domStr = 'K';
  //       break;

  //     default:
  //       domStr = point + '';
  //       break;
  //   }
  //   return domStr
  // };
  return (
    <div
      style={{
        ...style,
        color: decorData?.color,
      }}
      className={`${className} ${styles.decorBox}`}
    >
      {/* 点数 */}
       {/* <span style={{display:'none'}}>{getPointDom()}</span> */}
       {/* 花色 */}
       {decorData?.text}
     
    </div>
  );
};

export default Decor;
