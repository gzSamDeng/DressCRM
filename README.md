# DressCRM

晚礼服外贸获客 CRM 原型。

## 当前功能

- 客户数据库浏览
- 搜索与筛选
- Excel / CSV 导入
- 客户详情查看
- 数据导出
- AI 邮件草稿入口（原型）
- 产品类别字段：Premium Evening Dress / Heavy Hand-beaded Couture / Both / Unclassified

## 本地运行

直接双击 `index.html`，或使用本地静态服务器：

```bash
python -m http.server 8080
```

然后打开：

```text
http://localhost:8080
```

## 部署到 Vercel

1. 把本目录上传到 GitHub 仓库。
2. 在 Vercel 中导入该仓库。
3. Framework Preset 选择 `Other`。
4. Build Command 留空。
5. Output Directory 留空。
6. 点击 Deploy。

## 下一阶段

- Supabase 登录与云端数据库
- 服务端去重
- AI 客户分析
- 邮件审核队列
- SMTP / API 发送
- 多用户权限
