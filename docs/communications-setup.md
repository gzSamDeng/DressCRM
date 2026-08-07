# 电话与 WhatsApp 管理员配置

## 网页电话（Telnyx）

1. 在 Telnyx 购买一个可用于外呼的号码。
2. 创建 Credential Connection 和 Telephony Credential，并按业务国家开放外呼权限。
3. 在 Vercel 的 Production 环境添加：
   - `TELNYX_API_KEY`
   - `TELNYX_TELEPHONY_CREDENTIAL_ID`
   - `TELNYX_CALLER_NUMBER`（E.164 格式，例如 `+1...`）
4. 重新部署后，在“客户跟进 → 电话”点击“连接电话”，允许浏览器使用麦克风，再拨号。

系统只向已登录业务员签发短期电话令牌，不会把 Telnyx API Key 发到浏览器。

## WhatsApp Business Platform（Meta Cloud API）

1. 在 Meta for Developers 创建 Business 类型应用，添加 WhatsApp 产品并绑定 WhatsApp Business Account 和发件号码。
2. 创建长期或系统用户 Access Token，并确保具备 WhatsApp 消息权限。
3. 在 Vercel 的 Production 环境添加：
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - `WHATSAPP_VERIFY_TOKEN`（管理员自定义的随机字符串）
   - `META_APP_SECRET`
   - `WHATSAPP_DISPLAY_NUMBER`（可选，仅用于页面显示）
   - `WHATSAPP_GRAPH_VERSION`（可选，默认 `v23.0`）
4. 在 Meta Webhooks 设置回调：
   - URL：`https://dress-crm.vercel.app/api/whatsapp/webhook`
   - Verify Token：与 `WHATSAPP_VERIFY_TOKEN` 完全一致
   - 订阅 `messages` 字段。
5. 在 Supabase SQL Editor 执行 `supabase/008_whatsapp_business.sql`。未执行时，匹配到客户的消息仍会写入通用跟进记录；执行后可额外保存完整消息状态、原始事件和未匹配消息。
6. 确保客户线索中的 WhatsApp 号码带国家码。系统会按号码自动匹配客户并保存往来记录。

主动联系或客户超过 24 小时未发消息时，系统要求使用 Meta 已审核模板；客户发来消息后的 24 小时内可发送自由文本。

