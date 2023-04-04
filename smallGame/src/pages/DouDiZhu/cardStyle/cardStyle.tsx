import Decor from '@/components/decor/decor';
import { I_Card } from '@/utils/cartd';
import styles from './cardStyle.less';
interface I_CardStyle {
  card: I_Card;
  activeCardId:number[]
  onClickCard: (card: I_Card) => void;
}

const CardStyle: React.FC<I_CardStyle> = ({ card,  onClickCard,activeCardId }) => {
  const isActive=activeCardId.indexOf(card.id)>=0
  return (
    <div
      className={`${styles.cardBox} ${isActive&&styles.active} ${(card.color===1||card.color===3)&&styles.redColor}`}
      style={{
        zIndex:60-card.id
      }}
      onClick={(e) => {
        onClickCard(card);
        e.stopPropagation()
      }}
    >
      {/* 卡牌名称   卡牌点数 */}
      <div className={styles.cardName}>
        {card.point < 17 ? (
          <>
            <div> {card.name}</div>
            {/* 花色 */}
            <Decor cardColor={card.color} point={card.point} />
          </>
        ) : (
          <div className={styles.joker}>{card.name}</div>
        )}
      </div>

      <div className={styles.content}>
        {
          card.point < 17 ?   <Decor
          style={{
            fontSize: 50,
            marginLeft:0
          }}
          cardColor={card.color}
          point={card.point}
        />:<div className={styles.jokerContent}>
          { card.point===17?"小王":"大王"}
        </div>
        }
     
      </div>
    </div>
  );
};

export default CardStyle;
