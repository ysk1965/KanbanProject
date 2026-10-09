-- 사진 공유 링크별 미리보기(OG) 이미지.
-- 카카오/슬랙 등 링크 미리보기 카드에 조직 로고 대신 쓸 이미지를 링크 단위로 지정한다 (NULL 이면 기존 폴백).

DO $$ BEGIN
    ALTER TABLE photo_share_links ADD COLUMN og_image_url VARCHAR(500);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
