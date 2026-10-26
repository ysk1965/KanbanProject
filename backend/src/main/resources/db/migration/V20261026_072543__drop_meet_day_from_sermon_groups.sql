-- 모임 「모이는 요일·시간」 제거 — 표시용 칩 말고 쓰이는 곳이 없어 만들기 화면에서 뺐다
ALTER TABLE sermon_groups DROP COLUMN IF EXISTS meet_dow;
ALTER TABLE sermon_groups DROP COLUMN IF EXISTS meet_time;
