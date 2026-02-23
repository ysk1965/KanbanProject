import { Board } from '../types';

export const getTeamBoards = (boards: Board[]): Board[] => {
  return boards.filter(b => b.board_type !== 'PERSONAL');
};
