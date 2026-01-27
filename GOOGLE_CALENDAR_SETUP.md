# Google Calendar 集成设置指南

## 步骤 1: 创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 记住项目名称

## 步骤 2: 启用 Google Calendar API

1. 在 Google Cloud Console 中，进入 **API 和服务** > **库**
2. 搜索 "Google Calendar API"
3. 点击并启用该 API

## 步骤 3: 创建 OAuth 2.0 凭据

1. 进入 **API 和服务** > **凭据**
2. 点击 **创建凭据** > **OAuth 客户端 ID**
3. 如果提示配置 OAuth 同意屏幕：
   - 选择 **外部**（用于测试）或 **内部**（仅限组织）
   - 填写应用名称（如 "SyncUp Calendar"）
   - 添加你的邮箱作为用户支持邮箱
   - 保存并继续
4. 应用类型选择 **Web 应用**
5. 添加授权的 JavaScript 源：
   - 开发环境：`http://localhost:3000`
   - 生产环境：你的实际域名（如 `https://yourdomain.com`）
6. 点击 **创建**
7. 复制 **客户端 ID**（Client ID）

## 步骤 4: 创建 API 密钥（可选但推荐）

1. 在 **凭据** 页面，点击 **创建凭据** > **API 密钥**
2. 复制 API 密钥
3. （可选）限制 API 密钥仅用于 Google Calendar API

## 步骤 5: 配置环境变量

1. 复制 `.env.local.example` 为 `.env.local`
2. 填入你的凭据：

```env
VITE_GOOGLE_CLIENT_ID=你的客户端ID
VITE_GOOGLE_API_KEY=你的API密钥
```

## 步骤 6: 测试连接

1. 启动开发服务器：`npm run dev`
2. 在应用中点击 **Connect Google** 按钮
3. 使用你的 Google 账号登录
4. 授权应用访问你的日历
5. 点击 **Sync Calendar** 同步你的日历事件

## 权限说明

应用需要以下权限：
- `https://www.googleapis.com/auth/calendar.readonly` - 只读访问你的日历事件

## 故障排除

### 问题：无法加载 Google API
- 检查网络连接
- 确认 `.env.local` 文件中的 `VITE_GOOGLE_CLIENT_ID` 已正确设置

### 问题：OAuth 错误 "redirect_uri_mismatch"
- 确认在 Google Cloud Console 中添加了正确的授权 JavaScript 源
- 开发环境必须是 `http://localhost:3000`（或你使用的端口）

### 问题：API 调用失败
- 确认已启用 Google Calendar API
- 检查 API 密钥是否正确
- 确认 OAuth 同意屏幕已配置

### 问题：无法看到日历事件
- 确认你的 Google 日历中有今天的事件
- 检查事件时间是否在 09:00 AM - 08:00 PM 范围内
- 查看浏览器控制台的错误信息

## 生产环境部署

部署到生产环境时：

1. 在 Google Cloud Console 中添加生产域名到授权 JavaScript 源
2. 更新 `.env.local` 或使用环境变量配置
3. 确保使用 HTTPS（Google OAuth 要求）

## 安全建议

- 不要将 `.env.local` 文件提交到 Git
- 限制 API 密钥的使用范围
- 定期轮换 API 密钥
- 在生产环境中使用环境变量而不是 `.env` 文件
