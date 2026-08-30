-- 清空除用户信息和图片信息以外的所有数据库数据
-- 数据库：scg_picture (端口 3366)
-- 注意：此操作会保留 user 表和 picture 表的数据

-- 禁用外键检查
SET FOREIGN_KEY_CHECKS = 0;

-- 清空空间相关表
TRUNCATE TABLE space;
TRUNCATE TABLE space_user;

-- 重置自增 ID（可选，如果需要从 1 开始）
-- ALTER TABLE space AUTO_INCREMENT = 1;
-- ALTER TABLE space_user AUTO_INCREMENT = 1;

-- 恢复外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 验证清空结果
SELECT 'user 表数据量:' as table_name, COUNT(*) as count FROM user
UNION ALL
SELECT 'picture 表数据量:', COUNT(*) FROM picture
UNION ALL
SELECT 'space 表数据量:', COUNT(*) FROM space
UNION ALL
SELECT 'space_user 表数据量:', COUNT(*) FROM space_user;
