import styles from './playerHeader.less';

import { I_player } from '../../douDiZhu';

const PlayerHeader: React.FC<{ player: I_player; index: number }> = ({
  player,
  index,
}) => {
  return (
    <div className={styles.playerHeader}>
      <div
        className={` ${styles['role_' + player.position]} ${
          styles['index_' + index]
        }`}
      >
        <div className={styles.playerName}>玩家{player.playerId}</div>
      </div>
    </div>
  );
};
export default PlayerHeader;
