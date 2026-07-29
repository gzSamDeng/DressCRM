# DressCRM v1.0 — 第一阶段

正式的 Next.js + Supabase CRM。

## 已实现

- Supabase 邮箱密码登录
- 客户 Dashboard
- 59 家客户种子数据
- 客户搜索、等级与产品线筛选
- 客户新增、编辑、删除
- 客户详情
- 跟进记录
- RLS 数据权限
- Vercel 自动部署兼容

## 1. Supabase 建表

进入 Supabase → SQL Editor → New query。

打开并复制 `supabase/schema.sql` 的全部内容，粘贴后 Run。

然后打开并复制 `supabase/seed.sql` 的全部内容，粘贴后 Run。

注意：不要只输入文件名。必须复制文件里面的 SQL 内容。

## 2. 创建登录用户

Supabase → Authentication → Users → Add user → Create new user。

勾选 Auto Confirm User。密码请自行保存，不要提交到 GitHub。

## 3. 获取环境变量

Supabase 项目顶部点 Connect，或进入 Project Settings → API：

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## 4. Vercel 配置

Vercel → DressCRM → Settings → Environment Variables，添加以上两个变量，应用到 Production / Preview / Development。

## 5. GitHub 上传

删除仓库中原来的静态 `index.html` 等旧文件，把本项目解压后的**文件内容**上传到仓库根目录。

根目录必须直接看到：

- `app`
- `components`
- `lib`
- `supabase`
- `package.json`
- `proxy.ts`

提交后 Vercel 会自动部署。

## 本地运行

```bash
cp .env.example .env.local
npm install
npm run dev
```
