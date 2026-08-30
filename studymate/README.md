# StudyMate Learning Agent

StudyMate 是一个面向大学生的全栈 AI 学习工作台。它支持上传 PDF、DOCX、PPTX、TXT，自动提取和切分内容，并通过 DeepSeek 提供严格基于所选资料的问答、总结、重点提炼、练习测验和考前复习。

## 技术栈

- 前端：React 19、Vite、TypeScript、React Router、TanStack Query、Tailwind CSS 4
- 后端：Python 3.11+、FastAPI、SQLAlchemy 2、Alembic、Pydantic、PyJWT、bcrypt
- 数据：本地模式使用 SQLite 与 JSON 向量索引；部署模式支持 MySQL 8.4 与 Qdrant
- AI：DeepSeek OpenAI-compatible Chat Completions API，密钥只保存在服务端
- 测试：pytest、Ruff、mypy、Vitest、React Testing Library

旧的 `server/` Node.js 代码仅作为迁移参考保留；根目录所有构建、测试和启动命令现在都使用 `backend/` 中的 Python 后端。

## 一键本地运行

本地模式不需要 Docker、MySQL 或 Qdrant，数据保存在 `.local-data`。

1. 复制 `.env.example` 为 `.env`，填写至少 32 位的 `JWT_SECRET` 和 `DEEPSEEK_API_KEY`。
2. 创建 Python 虚拟环境并安装依赖：

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
   ```

3. 安装前端依赖、构建并启动：

   ```powershell
   npm install
   npm --prefix client install
   npm run local:build
   npm run local
   ```

4. 打开 `http://127.0.0.1:4173`，创建账号后即可使用全部功能。

`npm run local` 会自动使用 `.venv`，以 SQLite 启动 FastAPI，并由同一端口托管构建后的 React 页面。`LOCAL_DATA_DIR` 或 `DATA_DIRECTORY` 可更改数据目录，`LOCAL_PORT` 可更改端口。

## MySQL + Qdrant 开发模式

```powershell
docker compose up -d
npm run db:migrate
npm run dev:server
npm run dev:client
```

此模式使用 `.env` 中的 `DATABASE_URL`。设置 `VECTOR_BACKEND=qdrant` 后资料向量写入 `QDRANT_URL` 指向的实例。前端默认位于 `http://localhost:5173`，API 位于 `http://localhost:5000`，健康检查为 `http://localhost:5000/api/health`。

## 常用环境变量

- `DATABASE_URL`：MySQL 连接串；`mysql://` 会自动转换为 PyMySQL 驱动格式
- `JWT_SECRET`：JWT 签名密钥，至少 32 个字符
- `CLIENT_URL`：允许携带 Cookie 的前端来源
- `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`：DeepSeek 配置
- `VECTOR_BACKEND`：`local` 或 `qdrant`
- `QDRANT_URL`、`QDRANT_COLLECTION`：Qdrant 连接配置
- `DATA_DIRECTORY` / `LOCAL_DATA_DIR`：本地数据库、上传文件和向量索引目录
- `MAX_UPLOAD_BYTES`：单文件上传上限，默认 25 MB
- `VITE_API_URL`：可选前端 API 地址，默认 `/api`

不要提交 `.env`，也不要把数据库、JWT 或 DeepSeek 密钥放入任何 `VITE_` 变量。

## 数据库迁移

```powershell
npm run db:migrate
```

该命令运行 Alembic。初始迁移建立用户、资料、处理任务、会话、消息、生成内容、测验和题目表。FastAPI 普通 MySQL 启动不会擅自创建或修改表结构；本地 SQLite 模式会自动初始化。

## 质量检查

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

后端测试覆盖健康检查、安全错误、注册登录、CSRF、资料签名与权限隔离、解析与切片、本地/Qdrant 向量检索、DeepSeek 接口适配、证据不足拒答、总结、历史会话、结构化测验、评分和仪表盘。GitHub Actions 使用 Python 3.12、Node.js、MySQL 和 Qdrant 执行迁移与完整检查。

## 已实现功能

- 注册、登录、退出、会话恢复和用户数据隔离
- HttpOnly JWT Cookie、双提交 CSRF、CORS、安全响应头和请求 ID
- PDF、DOCX、PPTX、TXT 上传、内容签名校验、文本提取、420/60 重叠切片
- 本地 384 维确定性向量索引与 Qdrant 适配器
- 仅使用所选且处理完成资料的 DeepSeek 问答，支持中英文和入门模式
- 固定的证据不足拒答、来源文件名校验和多轮会话历史
- 智能总结、重点提炼、考前复习、结构化测验、答案隐藏和自动评分
- 仪表盘统计、资料库、会话、生成内容和测验历史恢复
