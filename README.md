# AI 应用项目合集

本仓库包含两个独立的全栈项目，均已按前后端边界整理。

## 项目目录

- `studymate/`：资料驱动的 AI 学习平台，React 19 前端与 FastAPI 后端。
- `scg-picture/frontend/`：SCG Picture 的 Vue 3 前端。
- `scg-picture/backend/`：SCG Picture 的 Spring Boot 后端。

## 安全说明

仓库只保留配置模板和环境变量占位符，不包含真实 API Key、数据库密码、云存储密钥、兑换码或业务数据。

- StudyMate：复制 `studymate/.env.example` 为 `studymate/.env` 后填写本地配置。
- SCG Picture 后端：复制 `scg-picture/backend/src/main/resources/application-local.example.yml` 为 `application-local.yml`，通过环境变量提供密钥。
- SCG Picture 兑换码：复制 `vipCode.example.json` 为 `vipCode.json`，仅在本机维护真实兑换码。

请勿提交 `.env`、`application-local.yml`、`application-prod.yml`、`vipCode.json`、数据库导出文件或任何构建产物。

## 子项目文档

每个项目的安装、运行和测试方式请查看对应目录中的 `README.md`。

