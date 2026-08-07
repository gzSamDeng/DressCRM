# 电话与 WhatsApp 管理员配置

## 电脑电话（DIDWW phone.systems）

1. 注册 DIDWW 企业账号，申请 Outbound Trunk 外呼权限并购买用于显示主叫号码的 DID。
2. 在 DIDWW User Panel 为号码启用 `phone.systems`，进入 phone.systems 管理后台创建业务员和 Application Line。
3. 为业务员开启 `External Outbound Calls`，选择 Caller ID；如需录音，同时开启 `Outbound External` 录音并选择交付位置。
4. 每位业务员根据邀请邮件安装并激活 phone.systems 桌面应用（Windows、MacOS 和 Linux 均支持）。
5. 在 Vercel Production 环境添加：
   - `DIDWW_PHONE_SYSTEMS_ENABLED=true`
   - `DIDWW_CALLER_NUMBER`（E.164 格式，例如 `+1...`，用于页面提示）
6. 重新部署后，在“客户跟进 → 电话”选择客户并点击“用 DIDWW 拨号”。浏览器首次询问时允许打开 phone.systems 应用。

系统通过 DIDWW 官方 `phone.systems://call?number=` 协议发起通话，不在网页或数据库中保存 SIP 密码。通话结束后点击“结束并留痕”，再补充沟通摘要。DIDWW 的精确接通状态、录音和 AI insights 以 phone.systems Call History 为准；后续可在 DIDWW 开放接口后再同步到系统。

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
