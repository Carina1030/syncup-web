# Apple Calendar (iCloud) 集成设置指南

## 概述

Apple Calendar 使用 CalDAV 协议进行同步。本应用通过 CalDAV 连接到你的 iCloud Calendar。

## 步骤 1: 启用两步验证

1. 访问 [Apple ID 网站](https://appleid.apple.com/)
2. 使用你的 Apple ID 登录
3. 进入 **安全** 部分
4. 确保已启用 **双重认证**（Two-Factor Authentication）

## 步骤 2: 生成应用专用密码

1. 在 [Apple ID 网站](https://appleid.apple.com/) 登录
2. 进入 **安全** → **应用专用密码**
3. 点击 **生成密码...**
4. 输入标签名称（如 "SyncUp Calendar"）
5. 点击 **创建**
6. **重要**: 立即复制生成的密码（格式：`xxxx-xxxx-xxxx-xxxx`）
   - 此密码只显示一次，无法再次查看

## 步骤 3: 在应用中连接

1. 启动应用
2. 点击 **Connect Apple** 按钮
3. 输入你的 Apple ID 邮箱（如 `your.email@icloud.com`）
4. 输入刚才生成的应用专用密码（不是你的 Apple ID 密码）
5. 点击 **Connect**

## 步骤 4: 同步日历

1. 连接成功后，点击 **Sync Calendar** 按钮
2. 应用会从你的 iCloud Calendar 获取今天的事件
3. 事件会自动匹配到相应的时间槽

## 技术说明

### CalDAV 服务器地址

- **iCloud**: `https://caldav.icloud.com/[你的AppleID]/calendars/`
- 应用会自动生成正确的 URL

### 自定义 CalDAV 服务器

如果你使用其他 CalDAV 服务器（如 Nextcloud、ownCloud），可以：
1. 在连接表单中勾选 "Use Custom CalDAV Server"
2. 输入你的 CalDAV 服务器地址
3. 使用相应的用户名和密码

### 后端代理（推荐用于生产环境）

由于浏览器的 CORS 限制，直接从前端访问 CalDAV 可能受限。生产环境建议：

1. **实现后端代理服务器**：
   - 创建一个 API 端点处理 CalDAV 请求
   - 在后端存储和应用专用密码
   - 前端通过 API 调用后端，后端再访问 CalDAV

2. **设置环境变量**：
   ```env
   VITE_CALDAV_PROXY_URL=https://your-api.com/api/caldav
   ```

3. **后端示例**（Node.js/Express）：
   ```javascript
   app.post('/api/caldav', async (req, res) => {
     const { serverUrl, username, password, startDate, endDate } = req.body;
     // 使用 CalDAV 客户端库（如 node-caldav）获取事件
     // 返回 iCal 格式的事件数据
   });
   ```

## 故障排除

### 问题：连接失败 "Authentication failed"

**解决方案**：
- 确认使用的是**应用专用密码**，不是 Apple ID 密码
- 确认两步验证已启用
- 检查 Apple ID 邮箱是否正确

### 问题：无法获取日历事件

**解决方案**：
- 确认你的 iCloud Calendar 中有今天的事件
- 检查事件时间是否在 09:00 AM - 08:00 PM 范围内
- 查看浏览器控制台的错误信息
- 如果使用自定义服务器，确认 CalDAV URL 正确

### 问题：CORS 错误

**解决方案**：
- 这是浏览器的安全限制
- 需要实现后端代理服务器
- 或者使用浏览器扩展来绕过 CORS（仅用于开发）

### 问题：事件时间不匹配

**解决方案**：
- 应用会自动匹配最接近的时间槽
- 如果事件时间不在可用时间槽范围内，可能不会显示
- 确保事件是全天事件或时间在 09:00-20:00 之间

## 安全建议

1. **不要将应用专用密码提交到 Git**
   - 密码仅存储在浏览器内存中（刷新页面后会丢失）
   - 生产环境应使用后端存储

2. **定期轮换应用专用密码**
   - 在 Apple ID 设置中删除旧的密码
   - 生成新的密码

3. **使用 HTTPS**
   - 确保应用运行在 HTTPS 上
   - 保护传输中的凭据

4. **限制权限**
   - 应用只读取日历事件（只读权限）
   - 不会修改或删除你的日历事件

## 支持的日历服务

除了 iCloud，此实现还支持任何 CalDAV 兼容的服务器：

- ✅ iCloud Calendar
- ✅ Nextcloud Calendar
- ✅ ownCloud Calendar
- ✅ Baikal
- ✅ Radicale
- ✅ 其他 CalDAV 服务器

## 开发模式

如果没有配置 CalDAV 或连接失败，应用会自动使用演示数据，让你可以测试功能。

## 需要帮助？

如果遇到问题：
1. 检查浏览器控制台的错误信息
2. 确认网络连接正常
3. 验证 Apple ID 和应用专用密码正确
4. 查看本文档的故障排除部分
