// Feature 색상 팔레트
export const FEATURE_COLORS = [
  '#8B5CF6', // purple
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
  '#84CC16', // lime
];

// 랜덤 색상 선택
export const getRandomFeatureColor = () => {
  return FEATURE_COLORS[Math.floor(Math.random() * FEATURE_COLORS.length)];
};
