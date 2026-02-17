import { Board, BoardType } from '../types';

export const isPersonalBoard = (board: Board): boolean => {
  return board.board_type === 'PERSONAL';
};

export const getPersonalBoardFromList = (boards: Board[]): Board | undefined => {
  return boards.find(b => b.board_type === 'PERSONAL');
};

export const getTeamBoards = (boards: Board[]): Board[] => {
  return boards.filter(b => b.board_type !== 'PERSONAL');
};
